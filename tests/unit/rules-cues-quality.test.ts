import { describe, expect, it } from "vitest";
import { aggregateFindings, evaluateStroke, prioritizeFindings, type StrokeForRules } from "@/lib/cv/rules";
import { CueScheduler } from "@/lib/cv/cues";
import { CUES } from "@/lib/cv/config";
import { evaluateSetup, readiness } from "@/lib/cv/quality";
import { FeatureTracker } from "@/lib/cv/features";
import { categoryScores } from "@/lib/report/scores";
import type { Measurement } from "@/lib/tennis/types";
import { synthForehands } from "../fixtures/synthetic";

const m = (key: string, value: number, confidence: Measurement["confidence"] = "medium"): Measurement => ({
  key, label: key, value, unit: "deg", confidence, method: "measured_2d",
});
const stroke = (id: string, metrics: Measurement[], type: StrokeForRules["type"] = "forehand"): StrokeForRules => ({
  id, type, t0: 0, t1: 3000, contactT: 1500, metrics, recoveryObserved: true,
});

describe("technique rules", () => {
  it("flags straight legs on a single stroke", () => {
    const hits = evaluateStroke(stroke("a", [m("min_knee_deg", 172)]));
    expect(hits.map((h) => h.ruleId)).toContain("straight_legs");
  });

  it("does not flag acceptable knee bend", () => {
    expect(evaluateStroke(stroke("a", [m("min_knee_deg", 140)])).map((h) => h.ruleId)).not.toContain("straight_legs");
  });

  it("only reports a session finding when the pattern repeats", () => {
    const once = [stroke("a", [m("min_knee_deg", 172)]), stroke("b", [m("min_knee_deg", 140)]), stroke("c", [m("min_knee_deg", 142)]), stroke("d", [m("min_knee_deg", 139)])];
    const f1 = aggregateFindings(once).find((f) => f.ruleId === "straight_legs");
    expect(f1?.severity).toBe("ok");

    const often = [stroke("a", [m("min_knee_deg", 172)]), stroke("b", [m("min_knee_deg", 171)]), stroke("c", [m("min_knee_deg", 142)])];
    const f2 = aggregateFindings(often).find((f) => f.ruleId === "straight_legs");
    expect(f2?.severity).toMatch(/issue|watch/);
    expect(f2?.strokeIds).toEqual(["a", "b"]);
    expect(f2?.evidence[0]).toMatch(/2 of 3/);
  });

  it("never produces a red issue from low-confidence evidence", () => {
    const strokes = ["a", "b", "c"].map((id) => stroke(id, [m("min_knee_deg", 178, "low")]));
    const f = aggregateFindings(strokes).find((x) => x.ruleId === "straight_legs");
    expect(f?.severity).toBe("watch");
    expect(f?.confidence).toBe("low");
  });

  it("caps 3D-estimate rules at amber", () => {
    const strokes = ["a", "b", "c"].map((id) => stroke(id, [{ ...m("shoulder_turn_deg", 5), method: "estimated_3d" }]));
    const f = aggregateFindings(strokes).find((x) => x.ruleId === "limited_turn");
    expect(f?.severity).toBe("watch");
  });

  it("applies serve rules only to serves", () => {
    expect(evaluateStroke(stroke("a", [m("trophy_elbow_height", -1)], "forehand")).map((h) => h.ruleId)).not.toContain("trophy_elbow_low");
    expect(evaluateStroke(stroke("a", [m("trophy_elbow_height", -1)], "serve")).map((h) => h.ruleId)).toContain("trophy_elbow_low");
  });

  it("reports preparation consistency only with enough strokes", () => {
    const vals = [0.5, 0.9, 0.4, 1.1, 0.6];
    const strokes = vals.map((v, i) => stroke(`s${i}`, [{ ...m("prep_to_contact_s", v), unit: "s", method: "derived" }]));
    expect(aggregateFindings(strokes.slice(0, 4)).find((f) => f.ruleId === "prep_consistency")).toBeUndefined();
    expect(aggregateFindings(strokes).find((f) => f.ruleId === "prep_consistency")?.severity).toBe("watch");
  });

  it("prioritises high-priority, high-confidence issues first", () => {
    const sorted = prioritizeFindings([
      { priority: "low", confidence: "low", severity: "watch" },
      { priority: "high", confidence: "medium", severity: "issue" },
      { priority: "high", confidence: "high", severity: "ok" },
    ] as const);
    expect(sorted[0].severity).toBe("issue");
    expect(sorted[2].severity).toBe("ok");
  });

  it("scores only categories with evidence", () => {
    const findings = aggregateFindings(["a", "b"].map((id) => stroke(id, [m("min_knee_deg", 140)])));
    const scores = categoryScores(findings);
    expect(scores.find((s) => s.category === "balance")?.score).not.toBeNull();
    expect(scores.find((s) => s.category === "footwork")?.score).toBeNull();
  });
});

describe("live cue scheduler", () => {
  const cue = (key: string, at: number, extra: Partial<Parameters<CueScheduler["offer"]>[0]> = {}) => ({
    key, text: key, category: "balance" as const, priority: "medium" as const, confidence: "medium" as const, at, ...extra,
  });

  it("issues at most one cue and respects the global cooldown", () => {
    const s = new CueScheduler();
    s.offer(cue("a", 0));
    s.offer(cue("b", 0));
    expect(s.next(10, false)).not.toBeNull();
    expect(s.next(20, false)).toBeNull();
    s.offer(cue("b", CUES.globalCooldownMs));
    expect(s.next(CUES.globalCooldownMs + 20, false)?.key).toBe("b");
  });

  it("holds cues while the player is swinging", () => {
    const s = new CueScheduler();
    s.offer(cue("a", 0));
    expect(s.next(10, true)).toBeNull();
    expect(s.next(20, false)?.key).toBe("a");
  });

  it("does not repeat a cue within its cooldown and backs off after repeats", () => {
    const s = new CueScheduler();
    let t = 0;
    const issued: number[] = [];
    for (let i = 0; i < 40; i++) {
      t += 5000;
      s.offer(cue("a", t));
      if (s.next(t, false)) issued.push(t);
    }
    for (let i = 1; i < issued.length; i++) expect(issued[i] - issued[i - 1]).toBeGreaterThanOrEqual(CUES.perCueCooldownMs);
    expect(issued[CUES.repeatLimit] - issued[CUES.repeatLimit - 1]).toBeGreaterThanOrEqual(CUES.repeatBackoffMs);
  });

  it("drops low-confidence, muted and out-of-focus cues", () => {
    const s = new CueScheduler({ muted: ["legs"], focus: "balance" });
    s.offer(cue("low", 0, { confidence: "low" }));
    s.offer(cue("muted", 0, { category: "legs" }));
    s.offer(cue("other", 0, { category: "preparation" }));
    expect(s.next(10, false)).toBeNull();
  });

  it("prefers higher priority × confidence", () => {
    const s = new CueScheduler();
    s.offer(cue("minor", 0, { priority: "low" }));
    s.offer(cue("major", 0, { priority: "high", confidence: "high" }));
    expect(s.next(10, false)?.key).toBe("major");
  });

  it("discards stale cues", () => {
    const s = new CueScheduler();
    s.offer(cue("a", 0));
    expect(s.next(10_000, false)).toBeNull();
  });
});

describe("camera setup checks", () => {
  const feats = (opts: Parameters<typeof synthForehands>[0]) => {
    const tr = new FeatureTracker({ handedness: "right", aspect: 16 / 9 });
    return synthForehands({ reps: 1, ...opts }).frames.slice(0, 20).map((f) => tr.push(f));
  };

  it("fails when nobody is visible", () => {
    const checks = evaluateSetup({ recent: feats({ visibility: 0.05 }), luma: 120, backgroundMotion: 1 });
    expect(checks.find((c) => c.id === "person")?.status).toBe("fail");
    expect(readiness(checks).ready).toBe(false);
  });

  it("asks to move back when feet are out of frame", () => {
    const checks = evaluateSetup({ recent: feats({ feetOutOfFrame: true }), luma: 120, backgroundMotion: 1 });
    expect(checks.find((c) => c.id === "feet")?.message).toMatch(/Move your camera back/);
    expect(readiness(checks).ready).toBe(false);
  });

  it("reports low light", () => {
    const checks = evaluateSetup({ recent: feats({}), luma: 20, backgroundMotion: 1 });
    expect(checks.find((c) => c.id === "lighting")?.message).toMatch(/too low/);
  });

  it("keeps unverifiable checks manual instead of passing them", () => {
    const checks = evaluateSetup({ recent: feats({}), luma: 120, backgroundMotion: null });
    expect(checks.find((c) => c.id === "stable")?.status).toBe("manual");
    expect(checks.find((c) => c.id === "space")?.status).toBe("manual");
  });

  it("is ready with a good setup", () => {
    const checks = evaluateSetup({ recent: feats({}), luma: 120, backgroundMotion: 1 });
    expect(readiness(checks)).toEqual({ ready: true, headline: "You're ready to begin." });
  });

  it("warns about bystanders", () => {
    const checks = evaluateSetup({ recent: feats({ people: 2 }), luma: 120, backgroundMotion: 1 });
    expect(checks.find((c) => c.id === "single_person")?.status).toBe("warn");
  });
});
