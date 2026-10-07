import { describe, expect, it } from "vitest";
import { buildSeries, compareSessions, findImprovements, weekStreak, weeklyActivity } from "@/lib/progress/trends";
import { generateLocalPlan, rankDrills } from "@/lib/plan/generate";
import { getDrill } from "@/lib/tennis/drills";
import { defaultProfile } from "@/lib/data/provider";
import type { SessionRecord, StrokeRecord } from "@/lib/data/types";
import type { CameraView, Confidence } from "@/lib/tennis/types";

const stroke = (id: string, value: number, confidence: Confidence = "medium"): StrokeRecord => ({
  id, index: 0, type: "forehand", typeSource: "manual", typeConfidence: "high", typeReasons: [], t0: 0, t1: 2000, contactT: 1000,
  phases: [], quality: "high", visibility: 0.9, recoveryObserved: true, excluded: false, keyFrameTimes: [],
  metrics: [{ key: "turn_ratio_at_load", label: "x", value, unit: "%", confidence, method: "estimated_3d" }],
});

const session = (id: string, day: number, value: number, view: CameraView = "front", confidence: Confidence = "medium"): SessionRecord => ({
  id, title: id, createdAt: day, startedAt: Date.UTC(2026, 8, day), endedAt: null, durationMs: 600_000, source: "live", mode: "standard",
  selection: "forehand", cameraView: view, handedness: "right", mirrored: false, focus: null, drillId: null, status: "complete",
  analysisStatus: "local", analysisError: null, hasRecording: false, recordingMime: null, recordingCloudPath: null, videoSize: null,
  trackedFraction: 0.95, avgVisibility: 0.9, strokes: [stroke(`${id}-a`, value, confidence), stroke(`${id}-b`, value, confidence)],
  localReport: null, report: null, reportMeta: null, selectedGoal: null, notes: "", favorite: false, liveCues: [],
});

describe("progress trends", () => {
  it("never mixes camera views in one series", () => {
    const series = buildSeries([session("a", 1, 40, "front"), session("b", 2, 80, "side")]);
    expect(series).toHaveLength(2);
    expect(series.every((s) => s.points.length === 1)).toBe(true);
  });

  it("ignores low-confidence measurements", () => {
    expect(buildSeries([session("a", 1, 40, "front", "low")])).toHaveLength(0);
  });

  it("only celebrates consistent improvements across the last three comparable sessions", () => {
    const steady = [30, 32, 31, 70, 72, 75].map((v, i) => session(`s${i}`, i + 1, v));
    expect(findImprovements(buildSeries(steady))).toHaveLength(1);
    const oneOff = [30, 32, 31, 70, 31, 75].map((v, i) => session(`s${i}`, i + 1, v));
    expect(findImprovements(buildSeries(oneOff))).toHaveLength(0);
    expect(findImprovements(buildSeries(steady.slice(0, 4)))).toHaveLength(0); // not enough history
  });

  it("explains why sessions are not comparable", () => {
    const c = compareSessions(session("a", 1, 40, "front"), session("b", 2, 40, "side"), "forehand");
    expect(c.comparable).toBe(false);
    expect(c.reasons[0]).toMatch(/camera views/);
  });

  it("counts weekly activity and streaks", () => {
    const now = Date.UTC(2026, 8, 30, 12);
    const days = weeklyActivity([session("a", 30, 1)], 7, now);
    expect(days.reduce((s, d) => s + d.sessions, 0)).toBe(1);
    expect(weekStreak([session("a", 30, 1), session("b", 23, 1), session("c", 16, 1)], now)).toBe(3);
  });
});

describe("training plan generation", () => {
  it("respects a no-ball, at-home setup", () => {
    const p = { ...defaultProfile(), environment: "home" as const, withBall: false };
    const ranked = rankDrills(p, []);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.every((d) => !d.needsBall && !d.needsCourt)).toBe(true);
  });

  it("prioritises drills for recurring credible findings", () => {
    const p = defaultProfile();
    const plan = generateLocalPlan(p, [{ category: "legs", count: 3, confidence: "medium", drillId: "loaded-legs", title: "Little knee bend during loading" }]);
    const ids = plan.days.flatMap((d) => d.drillIds);
    expect(ids).toContain("loaded-legs");
    expect(plan.title).toMatch(/knee bend/i);
    expect(ids.every((id) => getDrill(id))).toBe(true);
  });

  it("is honest when there is no history", () => {
    const plan = generateLocalPlan(defaultProfile(), []);
    expect(plan.rationale).toMatch(/Not enough recorded sessions/);
  });
});
