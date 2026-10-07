import { describe, expect, it } from "vitest";
import { AnalyzeRequestSchema, ChatRequestSchema, CoachingReportSchema, type AnalyzeRequest, type CoachingReport } from "@/lib/ai/schemas";
import { sanitizeChat, sanitizePlan, sanitizeReport } from "@/lib/ai/postprocess";
import { fixtureReport } from "@/lib/ai/fixtures";

export const analyzeReq = (): AnalyzeRequest => ({
  sessionId: "sess1",
  player: { experience: "intermediate", handedness: "right", backhand: "two", goals: [], challenges: [] },
  selection: "forehand",
  cameraView: "side",
  durationSec: 30,
  trackedFraction: 0.9,
  strokes: [
    { id: "s1", type: "forehand", typeSource: "manual", typeConfidence: "high", t0: 0, t1: 3000, contactT: 1500, quality: "medium", phases: [], metrics: [], frames: [] },
    { id: "s2", type: "forehand", typeSource: "manual", typeConfidence: "high", t0: 3000, t1: 6000, contactT: 4500, quality: "low", phases: [], metrics: [], frames: [] },
  ],
  localFindings: [{ title: "Little knee bend", category: "legs", severity: "watch", confidence: "medium", evidence: ["min knee 170°"], strokeIds: ["s1", "s2"] }],
  limitations: [],
  previousObjectives: [],
  previousSummary: null,
  notes: null,
});

const report = (over: Partial<CoachingReport> = {}): CoachingReport => ({
  summary: "ok",
  whatWentWell: [],
  observations: [
    {
      id: "o1", category: "legs", strokeIds: ["s2", "ghost"], finding: "Straight legs", evidence: ["frame 2"], evidenceType: "visual",
      whyItMatters: "x", improvement: "y", drillId: "made-up-drill", priority: "high", confidence: "high", timestampStart: -5, timestampEnd: 999,
    },
    {
      id: "o2", category: "balance", strokeIds: ["s1"], finding: "Balanced", evidence: [], evidenceType: "visual",
      whyItMatters: "x", improvement: "y", drillId: "loaded-legs", priority: "low", confidence: "low", timestampStart: null, timestampEnd: null,
    },
  ],
  topPriorities: [{ observationId: "o1", title: "t", cue: "c" }, { observationId: "nope", title: "t", cue: "c" }],
  categoryNotes: [],
  limitations: [],
  inconclusive: [],
  recommendedNextSteps: [],
  ...over,
});

describe("request validation", () => {
  it("accepts a well-formed analysis request", () => {
    expect(AnalyzeRequestSchema.safeParse(analyzeReq()).success).toBe(true);
  });
  it("rejects non-image data URLs", () => {
    const r = analyzeReq();
    r.strokes[0].frames = [{ t: 0, phase: "contact", image: "data:text/html;base64,PHNjcmlwdD4=" }];
    expect(AnalyzeRequestSchema.safeParse(r).success).toBe(false);
  });
  it("rejects too many strokes", () => {
    const r = analyzeReq();
    r.strokes = Array.from({ length: 17 }, () => r.strokes[0]);
    expect(AnalyzeRequestSchema.safeParse(r).success).toBe(false);
  });
  it("rejects an empty chat", () => {
    const res = ChatRequestSchema.safeParse({
      player: analyzeReq().player, messages: [], context: { sessions: [], goals: [], drillLog: [] }, detailed: false,
    });
    expect(res.success).toBe(false);
  });
});

describe("AI response validation", () => {
  it("rejects a malformed report", () => {
    expect(CoachingReportSchema.safeParse({ summary: 3 }).success).toBe(false);
    expect(CoachingReportSchema.safeParse({ ...report(), observations: [{ id: "x" }] }).success).toBe(false);
  });

  it("sanitises unknown strokes, drills, timestamps and confidence", () => {
    const r = sanitizeReport(report(), analyzeReq());
    const o1 = r.observations.find((o) => o.id === "o1")!;
    expect(o1.strokeIds).toEqual(["s2"]);
    expect(o1.drillId).toBeNull();
    expect(o1.timestampStart).toBe(0);
    expect(o1.timestampEnd).toBe(30);
    // s2 was tracked with low quality, so "high" confidence is capped
    expect(o1.confidence).toBe("low");
  });

  it("drops observations without evidence and dangling priorities", () => {
    const r = sanitizeReport(report(), analyzeReq());
    expect(r.observations.map((o) => o.id)).toEqual(["o1"]);
    expect(r.topPriorities.map((p) => p.observationId)).toEqual(["o1"]);
  });

  it("limits top priorities to three", () => {
    const many = report({
      topPriorities: Array.from({ length: 6 }, () => ({ observationId: "o1", title: "t", cue: "c" })),
    });
    expect(sanitizeReport(many, analyzeReq()).topPriorities).toHaveLength(3);
  });

  it("removes chat references to sessions that were not provided", () => {
    const req = ChatRequestSchema.parse({
      player: analyzeReq().player,
      messages: [{ role: "user", content: "hi" }],
      context: {
        sessions: [{ id: "real", date: "2026-10-01", title: "t", selection: "auto", cameraView: "side", strokeCounts: {}, summary: null, findings: [], keyMetrics: [] }],
        goals: [],
        drillLog: [],
      },
      detailed: false,
    });
    const a = sanitizeChat(
      {
        answer: "a", details: null, followUps: ["1", "2", "3", "4"], usedSessionData: true,
        references: [{ sessionId: "real", strokeId: "invented", timestamp: 3, label: "x" }, { sessionId: "fake", strokeId: null, timestamp: null, label: "y" }],
      },
      req,
    );
    expect(a.references).toHaveLength(1);
    expect(a.references[0].strokeId).toBeNull();
    expect(a.followUps).toHaveLength(3);
  });

  it("filters plan drills to the library", () => {
    const p = sanitizePlan({ title: "t", rationale: "r", weeklyGoals: [], days: [{ day: "Mon", focus: "f", warmup: "w", drillIds: ["early-unit-turn", "nonsense"], notes: "" }] });
    expect(p.days[0].drillIds).toEqual(["early-unit-turn"]);
  });

  it("labels fixture output clearly", () => {
    const r = fixtureReport(analyzeReq());
    expect(r.summary).toMatch(/Test mode/);
    expect(CoachingReportSchema.safeParse(r).success).toBe(true);
  });
});
