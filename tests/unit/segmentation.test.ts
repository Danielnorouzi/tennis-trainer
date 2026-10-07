import { describe, expect, it } from "vitest";
import { FeatureTracker, type FeatureFrame } from "@/lib/cv/features";
import { LiveSegmenter, segmentStrokes } from "@/lib/cv/segmentation";
import { classifyStroke } from "@/lib/cv/classify";
import { analyzeSequence } from "@/lib/cv/pipeline";
import { getMeasurement } from "@/lib/cv/metrics";
import { PoseSmoother } from "@/lib/cv/smoothing";
import type { PoseFrame } from "@/lib/cv/landmarks";
import { synthForehands, synthIdle, synthServes } from "../fixtures/synthetic";

function features(frames: PoseFrame[], handedness: "right" | "left" = "right"): FeatureFrame[] {
  const tr = new FeatureTracker({ handedness, aspect: 16 / 9 });
  const sm = new PoseSmoother();
  return frames.map((f) => tr.push(sm.smooth(f)));
}

describe("stroke segmentation", () => {
  it("finds each swing and estimates contact near the true time", () => {
    const { frames, contacts } = synthForehands({ reps: 3 });
    const windows = segmentStrokes(features(frames));
    expect(windows).toHaveLength(3);
    windows.forEach((w, i) => {
      expect(Math.abs(w.contactT - contacts[i])).toBeLessThan(150);
      expect(w.prepStart).toBeLessThan(w.loadT);
      expect(w.loadT).toBeLessThan(w.contactT);
      expect(w.contactT).toBeLessThan(w.followEnd);
    });
  });

  it("orders phases and always marks contact as an estimate", () => {
    const { frames } = synthForehands({ reps: 1 });
    const [w] = segmentStrokes(features(frames));
    const names = w.phases.map((p) => p.name);
    expect(names.indexOf("preparation")).toBeLessThan(names.indexOf("contact"));
    expect(names.indexOf("contact")).toBeLessThan(names.indexOf("follow_through"));
    expect(w.phases.find((p) => p.name === "contact")?.estimated).toBe(true);
    for (let i = 1; i < w.phases.length; i++) expect(w.phases[i].start).toBeGreaterThanOrEqual(w.phases[i - 1].start);
  });

  it("detects nothing when the player stands still", () => {
    expect(segmentStrokes(features(synthIdle(5)))).toHaveLength(0);
  });

  it("detects nothing when no person is visible", () => {
    const { frames } = synthForehands({ reps: 2, visibility: 0.05 });
    expect(segmentStrokes(features(frames))).toHaveLength(0);
  });

  it("is robust to landmark jitter", () => {
    const { frames } = synthForehands({ reps: 3, jitter: 7 });
    expect(segmentStrokes(features(frames))).toHaveLength(3);
  });

  it("streams strokes live with the same results", () => {
    const { frames } = synthForehands({ reps: 3 });
    const seg = new LiveSegmenter();
    const emitted = features(frames).flatMap((f) => seg.push(f));
    expect(emitted.length).toBeGreaterThanOrEqual(2);
    const ts = emitted.map((w) => w.contactT);
    expect(new Set(ts).size).toBe(ts.length); // no duplicates
  });
});

describe("stroke classification", () => {
  it("classifies a right-handed forehand", () => {
    const { frames } = synthForehands({ reps: 1 });
    const fs = features(frames);
    const [w] = segmentStrokes(fs);
    expect(classifyStroke(fs, w).type).toBe("forehand");
  });

  it("classifies a left-handed (mirrored) forehand when handedness is set", () => {
    const { frames } = synthForehands({ reps: 1, handedness: "left" });
    const fs = features(frames, "left");
    const [w] = segmentStrokes(fs);
    expect(classifyStroke(fs, w).type).toBe("forehand");
  });

  it("never claims high confidence", () => {
    const { frames } = synthForehands({ reps: 2 });
    const fs = features(frames);
    for (const w of segmentStrokes(fs)) expect(classifyStroke(fs, w).confidence).not.toBe("high");
  });

  it("recognises a serve", () => {
    const { frames, contacts } = synthServes(2);
    const fs = features(frames);
    const ws = segmentStrokes(fs);
    expect(ws.length).toBe(2);
    expect(classifyStroke(fs, ws[0]).type).toBe("serve");
    // the refined contact estimate (highest hand point) is close to the true contact
    const { strokes } = analyzeSequence(fs, { view: "front", selection: "auto" });
    expect(strokes[0].type).toBe("serve");
    expect(Math.abs(strokes[0].contactT - contacts[0])).toBeLessThan(120);
  });
});

describe("measurements and confidence gating", () => {
  it("gates knee angles to low confidence in a front view", () => {
    const { frames } = synthForehands({ reps: 2 });
    const { strokes } = analyzeSequence(features(frames), { view: "front", selection: "forehand" });
    const knee = getMeasurement(strokes[0].metrics, "min_knee_deg");
    expect(knee?.confidence).toBe("low");
    expect(knee?.method).toBe("measured_2d");
  });

  it("labels rotation as a 3D estimate and never high confidence", () => {
    const { frames } = synthForehands({ reps: 2 });
    const { strokes } = analyzeSequence(features(frames), { view: "front", selection: "forehand" });
    const turn = getMeasurement(strokes[0].metrics, "shoulder_turn_deg");
    expect(turn?.method).toBe("estimated_3d");
    expect(turn?.confidence).not.toBe("high");
  });

  it("omits foot-dependent measurements when the feet are out of frame", () => {
    const { frames } = synthForehands({ reps: 2, feetOutOfFrame: true });
    const { strokes, report } = analyzeSequence(features(frames), { view: "front", selection: "forehand" });
    for (const s of strokes) expect(getMeasurement(s.metrics, "finish_head_offset")).toBeUndefined();
    expect(report.limitations.join(" ")).toMatch(/Feet/);
  });

  it("records an earlier unit turn for a well-prepared swing than a late one", () => {
    const early = analyzeSequence(features(synthForehands({ reps: 1 }).frames), { view: "front", selection: "forehand" });
    const late = analyzeSequence(features(synthForehands({ reps: 1, lateTurn: true }).frames), { view: "front", selection: "forehand" });
    const e = getMeasurement(early.strokes[0].metrics, "turn_ratio_at_load")!.value;
    const l = getMeasurement(late.strokes[0].metrics, "turn_ratio_at_load")!.value;
    expect(e).toBeGreaterThan(l);
  });

  it("warns about multiple people", () => {
    const { frames } = synthForehands({ reps: 2, people: 2 });
    const { report } = analyzeSequence(features(frames), { view: "front", selection: "forehand" });
    expect(report.limitations.join(" ")).toMatch(/more than one person/i);
  });
});
