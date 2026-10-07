// Per-stroke measurements. Each measurement carries its method (2D measurement, 3D model
// estimate, or derived timing) and a confidence that combines camera-view suitability with the
// landmark visibility inside the relevant time range. Measurements whose evidence is too weak are
// omitted entirely instead of being shown with a misleading number.

import { VIEW_SUITABILITY, type MetricFamily } from "./config";
import { angleDiff, mean, median, round } from "./geometry";
import type { FeatureFrame } from "./features";
import { framesBetween, type StrokeWindow } from "./segmentation";
import { strokeFamily } from "./classify";
import type { CameraView, Confidence, Measurement, MeasurementMethod, StrokeType } from "../tennis/types";

const ORDER: Confidence[] = ["low", "medium", "high"];
const down = (c: Confidence): Confidence => ORDER[Math.max(0, ORDER.indexOf(c) - 1)];
const minConf = (a: Confidence, b: Confidence): Confidence => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b);

/** Combine view suitability with visibility. Returns null when the evidence is insufficient. */
export function gateConfidence(family: MetricFamily, view: CameraView, visibility: number): Confidence | null {
  if (!Number.isFinite(visibility) || visibility < 0.4) return null;
  let c = VIEW_SUITABILITY[family][view] as Confidence;
  if (visibility < 0.6) c = down(c);
  return c;
}

export interface MetricContext {
  view: CameraView;
  strokeType: StrokeType;
}

export function getMeasurement(ms: Measurement[], key: string): Measurement | undefined {
  return ms.find((m) => m.key === key);
}

export function computeStrokeMetrics(frames: FeatureFrame[], w: StrokeWindow, ctx: MetricContext): Measurement[] {
  const out: Measurement[] = [];
  const add = (
    key: string, label: string, value: number, unit: Measurement["unit"], family: MetricFamily,
    method: MeasurementMethod, vis: number, note?: string, cap?: Confidence,
  ) => {
    if (!Number.isFinite(value)) return;
    let c = gateConfidence(family, ctx.view, vis);
    if (!c) return;
    if (cap) c = minConf(c, cap);
    out.push({ key, label, value: round(value, unit === "s" ? 2 : 1), unit, confidence: c, method, note });
  };

  const valid = (fs: FeatureFrame[]) => fs.filter((f) => f.valid);
  const ready = valid(framesBetween(frames, w.readyStart, w.prepStart));
  const swing = valid(framesBetween(frames, w.prepStart, w.contactT));
  const loadF = valid(framesBetween(frames, w.loadStart, w.loadT + 30));
  const contactF = valid(framesBetween(frames, w.contactT - 50, w.contactT + 50));
  const finishF = valid(framesBetween(frames, w.followEnd - 60, w.followEnd + 260));
  const legVis = mean(swing.map((f) => f.vis.legs));
  const armVis = mean(swing.map((f) => f.vis.arms));
  const coreVis = mean(swing.map((f) => f.vis.core));
  const finishVis = mean(finishF.map((f) => f.vis.overall));
  const family = strokeFamily(ctx.strokeType);

  // --- timing ---------------------------------------------------------------------------------
  add("prep_to_contact_s", "Preparation start → estimated contact", (w.contactT - w.prepStart) / 1000, "s", "timing", "derived", coreVis,
    "From the first arm movement to the swing-speed peak.");
  add("swing_duration_s", "Forward swing duration (estimate)", (w.contactT - w.loadT) / 1000, "s", "timing", "derived", armVis,
    "From the backswing turnaround to the speed peak.");
  add("tempo_index", "Relative swing tempo", w.peakSpeed, "torso/s", "timing", "derived", armVis,
    "Peak hand speed in body lengths per second. Useful for comparing your own swings — not racket or ball speed.", "medium");

  // --- rotation (model 3D estimate, never high confidence) -------------------------------------
  const baseYaw = median(ready.map((f) => f.shoulderYaw));
  if (Number.isFinite(baseYaw) && swing.length) {
    const turns = swing.map((f) => Math.abs(angleDiff(f.shoulderYaw, baseYaw)));
    const maxTurn = Math.max(...turns.filter(Number.isFinite));
    add("shoulder_turn_deg", "Shoulder turn from ready position", maxTurn, "deg", "rotation", "estimated_3d", coreVis,
      "Estimated from single-camera 3D pose; treat as approximate.", "medium");
    // How much of the eventual turn was already completed when the backswing turned around.
    const atLoad = mean(loadF.map((f) => Math.abs(angleDiff(f.shoulderYaw, baseYaw))));
    if (maxTurn > 15 && Number.isFinite(atLoad)) {
      add("turn_ratio_at_load", "Share of shoulder turn completed by end of backswing", (atLoad / maxTurn) * 100, "%", "rotation",
        "estimated_3d", coreVis, "Low values mean most of the turn happened during the forward swing.", "medium");
    }
    // When was 60% of the turn reached (before contact)?
    const firstIdx = swing.findIndex((f) => Math.abs(angleDiff(f.shoulderYaw, baseYaw)) >= 0.6 * maxTurn);
    if (maxTurn > 15 && firstIdx >= 0) {
      add("turn_lead_s", "Unit turn lead time before contact", (w.contactT - swing[firstIdx].t) / 1000, "s", "rotation", "estimated_3d", coreVis,
        "How long before the estimated contact the upper body was mostly turned.", "medium");
    }
  }
  const seps = swing.map((f) => Math.abs(f.separation)).filter(Number.isFinite);
  if (seps.length) {
    add("hip_shoulder_sep_deg", "Hip–shoulder separation (max)", Math.max(...seps), "deg", "rotation", "estimated_3d", coreVis,
      "Model estimate of how far the shoulders turned beyond the hips.", "low");
  }

  // --- legs -------------------------------------------------------------------------------------
  const kneeWindow = family === "serve" ? valid(framesBetween(frames, w.contactT - 1200, w.contactT - 80)) : swing;
  const knees = kneeWindow.map((f) => f.minKnee).filter(Number.isFinite);
  if (knees.length) {
    add("min_knee_deg", "Most-bent knee angle before contact", Math.min(...knees), "deg", "knee", "measured_2d", legVis,
      "2D angle in the image; foreshortened when the leg points toward the camera.");
  }
  const stance = loadF.map((f) => f.stanceWidth).filter(Number.isFinite);
  if (stance.length) {
    const method: MeasurementMethod = loadF[0]?.stanceMethod ?? "measured_2d";
    add("stance_width", "Stance width at loading (× shoulder width)", median(stance), "ratio", "stance", method,
      mean(loadF.map((f) => f.vis.feet)));
  }
  if (loadF.length && finishF.length) {
    const shift = (median(finishF.map((f) => f.com.x)) - median(loadF.map((f) => f.com.x))) / Math.max(1e-6, median(loadF.map((f) => f.torso)));
    add("com_shift", "Hip-centre travel from loading to finish (torso lengths)", Math.abs(shift), "torso", "weight", "measured_2d",
      mean(loadF.map((f) => f.vis.legs)), "A proxy for weight transfer; only meaningful from a side view.");
  }

  // --- arm --------------------------------------------------------------------------------------
  if (contactF.length) {
    add("elbow_at_contact_deg", "Hitting-arm elbow angle near estimated contact", mean(contactF.map((f) => f.domElbow)), "deg", "elbow",
      "measured_2d", mean(contactF.map((f) => f.vis.arms)), "Measured at the swing-speed peak, not at verified ball contact.");
  }

  // --- finish & balance ---------------------------------------------------------------------------
  if (finishF.length) {
    add("finish_lean_deg", "Trunk lean at finish", median(finishF.map((f) => f.trunkLean)), "deg", "lean", "measured_2d", finishVis);
    add("finish_head_offset", "Head offset from base of support at finish (torso lengths)", median(finishF.map((f) => Math.abs(f.headOverBase))),
      "torso", "lean", "measured_2d", mean(finishF.map((f) => f.vis.feet)));
    if (family === "groundstroke") {
      add("finish_side", "Hitting hand position at finish (shoulder widths, + = hitting side)", median(finishF.map((f) => f.sideProj)), "ratio",
        "finish", "estimated_3d", finishVis, "Negative values mean the swing finished across the body.");
      add("finish_height", "Hitting hand height at finish (torso lengths above shoulder)", median(finishF.map((f) => f.domWristHeight)), "torso",
        "finish", "measured_2d", finishVis);
    }
  }

  // --- recovery ---------------------------------------------------------------------------------
  if (w.recoveryObserved) {
    add("recovery_s", "Time to settle after the finish", (w.recoveryEnd - w.followEnd) / 1000, "s", "timing", "derived", finishVis);
  }

  // --- serve-specific -----------------------------------------------------------------------------
  if (family === "serve" || family === "overhead") {
    const pre = valid(framesBetween(frames, w.contactT - 1300, w.contactT - 60));
    const trophy = valid(framesBetween(frames, w.loadT - 150, w.loadT + 50));
    if (trophy.length) {
      add("trophy_elbow_height", "Hitting elbow height at loading (torso lengths above shoulder)", median(trophy.map((f) => f.domElbowHeight)),
        "torso", "trophy", "measured_2d", mean(trophy.map((f) => f.vis.arms)));
    }
    if (pre.length) {
      add("toss_arm_peak", "Non-hitting arm peak height (torso lengths above shoulder)", Math.max(...pre.map((f) => f.nonDomWristHeight)),
        "torso", "trophy", "measured_2d", mean(pre.map((f) => f.vis.arms)), "Tracks the tossing arm, not the ball.");
      const lastUp = [...pre].reverse().find((f) => f.nonDomWristHeight > 0.4);
      if (lastUp) {
        add("toss_arm_hold_s", "Tossing arm held up until (s before contact)", (w.contactT - lastUp.t) / 1000, "s", "trophy", "derived",
          mean(pre.map((f) => f.vis.arms)), "Smaller = the tossing arm stayed up longer.");
      }
    }
    if (contactF.length) {
      add("contact_reach", "Hitting hand height near estimated contact (torso lengths above shoulder)", mean(contactF.map((f) => f.domWristHeight)),
        "torso", "trophy", "measured_2d", mean(contactF.map((f) => f.vis.arms)));
    }
  }
  return out;
}

/** Simple summary used for stroke-level quality badges. */
export function strokeQuality(w: StrokeWindow): Confidence {
  if (w.visibility > 0.8 && w.validFraction > 0.9) return "high";
  if (w.visibility > 0.6 && w.validFraction > 0.75) return "medium";
  return "low";
}
