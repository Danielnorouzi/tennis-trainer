// Deterministic fixture responses for LOCAL TEST MODE (AI_MODE=fixture, never in production).
// They are derived only from the request's own on-device findings and clearly labelled, so they
// can never be mistaken for a real AI analysis.

import { DRILLS } from "../tennis/drills";
import type { AnalyzeRequest, ChatAnswer, ChatRequest, CoachingReport, Comparison, CompareRequest, PlanRequest, PlanResponse } from "./schemas";

export const FIXTURE_LABEL = "[Test mode — fixture output, not an AI analysis]";

export function fixtureReport(req: AnalyzeRequest): CoachingReport {
  const issues = req.localFindings.filter((f) => f.severity === "issue" || f.severity === "watch");
  const good = req.localFindings.filter((f) => f.severity === "ok");
  const observations = issues.slice(0, 5).map((f, i) => ({
    id: `obs${i + 1}`,
    category: f.category,
    strokeIds: f.strokeIds.filter((id) => req.strokes.some((s) => s.id === id)).slice(0, 5),
    finding: f.title,
    evidence: f.evidence.length ? f.evidence : ["On-device measurement"],
    evidenceType: "measurement" as const,
    whyItMatters: "Fixture text: in a live configuration the AI coach explains the impact here.",
    improvement: "Fixture text: in a live configuration the AI coach gives a specific adjustment here.",
    drillId: DRILLS.find((d) => d.focus.includes(f.category))?.id ?? null,
    priority: f.severity === "issue" ? ("high" as const) : ("medium" as const),
    confidence: f.confidence,
    timestampStart: null,
    timestampEnd: null,
  }));
  return {
    summary: `${FIXTURE_LABEL} ${req.strokes.length} stroke(s) were sent for analysis from a ${req.cameraView} view. ${issues.length} on-device finding(s) were flagged.`,
    whatWentWell: good.slice(0, 3).map((g) => g.title),
    observations,
    topPriorities: observations.slice(0, 3).map((o) => ({ observationId: o.id, title: o.finding, cue: "Fixture cue" })),
    categoryNotes: (["preparation", "balance", "timing", "rotation", "footwork", "follow_through", "recovery", "consistency"] as const).map((c) => ({
      category: c,
      assessable: req.localFindings.some((f) => f.category === c),
      note: "Fixture note.",
    })),
    limitations: [FIXTURE_LABEL, ...req.limitations.slice(0, 3)],
    inconclusive: ["Fixture mode does not look at the video frames."],
    recommendedNextSteps: observations.slice(0, 2).map((o) => `Practise: ${o.drillId ?? "general consistency"}`),
  };
}

export function fixtureChat(req: ChatRequest): ChatAnswer {
  const last = req.messages[req.messages.length - 1]?.content ?? "";
  const s = req.context.sessions[0];
  return {
    answer: `${FIXTURE_LABEL} You asked: "${last.slice(0, 120)}". ${s ? `Your most recent session (${s.title}) has ${s.findings.length} recorded finding(s).` : "No sessions are available yet."}`,
    details: null,
    references: s ? [{ sessionId: s.id, strokeId: null, timestamp: null, label: s.title }] : [],
    followUps: ["What should I focus on tomorrow?", "Show me the weakest part of my latest stroke.", "How can I improve my footwork?"],
    usedSessionData: Boolean(s),
  };
}

export function fixtureCompare(req: CompareRequest): Comparison {
  return {
    summary: `${FIXTURE_LABEL} Comparing ${req.comparableKeys.length} comparable measurement(s).`,
    differences: req.comparableKeys.slice(0, 5).map((k) => ({
      aspect: k,
      first: String(req.first.stroke.metrics.find((m) => m.key === k)?.value ?? "—"),
      second: String(req.second.stroke.metrics.find((m) => m.key === k)?.value ?? "—"),
      assessment: "similar" as const,
      confidence: "low" as const,
      evidence: "Fixture comparison of on-device measurements.",
    })),
    caveats: [FIXTURE_LABEL],
  };
}

export function fixturePlan(req: PlanRequest): PlanResponse {
  const focus = req.recurringFindings[0]?.category ?? "preparation";
  const drills = DRILLS.filter((d) => d.focus.includes(focus)).slice(0, 2).map((d) => d.id);
  return {
    title: `${FIXTURE_LABEL} Weekly plan`,
    rationale: "Fixture plan built from your most frequent on-device finding.",
    weeklyGoals: [`Work on ${focus.replace("_", " ")}`],
    days: ["Mon", "Wed", "Fri"].map((day) => ({ day, focus, warmup: "dynamic-warmup", drillIds: drills, notes: "Fixture." })),
  };
}
