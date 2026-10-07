// Session-level footwork indicators from the hip-centre trajectory. These are coarse proxies
// (single camera, no court calibration) and are labelled as such.

import { cv as coeffVar, mean, round } from "./geometry";
import type { FeatureFrame } from "./features";
import type { StrokeWindow } from "./segmentation";
import type { CameraView, Confidence, Measurement } from "../tennis/types";

/** Small two-footed hops: the hip centre rises then falls back within ~0.45 s. */
export function detectSplitSteps(frames: FeatureFrame[]): number[] {
  const hops: number[] = [];
  let riseAt: number | null = null;
  for (const f of frames) {
    if (!f.valid || f.vis.feet < 0.5) {
      riseAt = null;
      continue;
    }
    if (riseAt === null && f.comLift > 0.07) riseAt = f.t;
    else if (riseAt !== null && f.comLift < 0.02) {
      const dur = f.t - riseAt;
      if (dur > 80 && dur < 450 && (!hops.length || f.t - hops[hops.length - 1] > 600)) hops.push(riseAt);
      riseAt = null;
    } else if (riseAt !== null && f.t - riseAt > 600) riseAt = null;
  }
  return hops;
}

/** Bursts of sideways movement of the hip centre (torso lengths per second). */
export function detectLateralMoves(frames: FeatureFrame[], minSpeed = 1.0, minMs = 200): { t0: number; t1: number; dir: -1 | 1 }[] {
  const moves: { t0: number; t1: number; dir: -1 | 1 }[] = [];
  let start: FeatureFrame | null = null;
  let dir: -1 | 1 = 1;
  for (const f of frames) {
    const fast = f.valid && Math.abs(f.comSpeedX) >= minSpeed;
    const d: -1 | 1 = f.comSpeedX >= 0 ? 1 : -1;
    if (fast && (!start || d === dir)) {
      if (!start) {
        start = f;
        dir = d;
      }
    } else if (start) {
      if (f.t - start.t >= minMs) moves.push({ t0: start.t, t1: f.t, dir });
      start = fast ? f : null;
      dir = d;
    }
  }
  return moves;
}

export function footworkMetrics(frames: FeatureFrame[], strokes: StrokeWindow[], view: CameraView): Measurement[] {
  const out: Measurement[] = [];
  const feetVis = mean(frames.filter((f) => f.valid).map((f) => f.vis.feet));
  if (!Number.isFinite(feetVis) || feetVis < 0.45) return out;
  const conf: Confidence = feetVis > 0.7 ? "medium" : "low";

  const hops = detectSplitSteps(frames);
  out.push({ key: "split_steps", label: "Split-step-like hops detected", value: hops.length, unit: "count", confidence: "low", method: "derived",
    note: "Detected from small vertical hip movements; small hops can be missed or confused with other movement." });

  if (view === "front" || view === "rear" || view === "diagonal") {
    const moves = detectLateralMoves(frames);
    out.push({ key: "lateral_moves", label: "Sideways movement bursts", value: moves.length, unit: "count", confidence: conf, method: "derived" });
    const changes = moves.slice(1).filter((m, i) => m.dir !== moves[i].dir).length;
    out.push({ key: "direction_changes", label: "Direction changes", value: changes, unit: "count", confidence: conf, method: "derived" });
  }

  const readyWidths = strokes.flatMap((w) =>
    frames.filter((f) => f.valid && f.t >= w.readyStart && f.t <= w.prepStart).map((f) => f.stanceWidth),
  ).filter(Number.isFinite);
  if (readyWidths.length >= 10) {
    out.push({ key: "ready_stance_width", label: "Ready-position stance width (× shoulder width)", value: round(mean(readyWidths), 2), unit: "ratio",
      confidence: view === "side" ? "low" : conf, method: frames[0]?.stanceMethod ?? "measured_2d" });
    const c = coeffVar(readyWidths);
    if (Number.isFinite(c)) {
      out.push({ key: "ready_stance_cv", label: "Ready-position consistency (variation)", value: round(c * 100, 0), unit: "%",
        confidence: view === "side" ? "low" : conf, method: "derived", note: "Lower = more consistent ready position." });
    }
  }
  if (strokes.length >= 2) {
    const observed = strokes.filter((w) => w.recoveryObserved).length;
    out.push({ key: "recovery_observed_pct", label: "Strokes followed by a visible recovery", value: round((observed / strokes.length) * 100, 0),
      unit: "%", confidence: conf, method: "derived" });
  }
  return out;
}
