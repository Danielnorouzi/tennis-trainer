// Post-validation of model output. Even schema-valid output is untrusted: we drop references to
// strokes/sessions/drills that don't exist, cap confidence where the evidence was weak, clamp
// timestamps into the session, and enforce list limits.

import { DRILL_IDS } from "../tennis/drills";
import type { Confidence } from "../tennis/types";
import type { AnalyzeRequest, ChatAnswer, ChatRequest, CoachingReport, Comparison, PlanResponse } from "./schemas";

const ORDER: Confidence[] = ["low", "medium", "high"];
const minConf = (a: Confidence, b: Confidence): Confidence => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const validDrill = (id: string | null) => (id && DRILL_IDS.includes(id) ? id : null);

export function sanitizeReport(r: CoachingReport, req: AnalyzeRequest): CoachingReport {
  const strokeIds = new Set(req.strokes.map((s) => s.id));
  const quality = new Map(req.strokes.map((s) => [s.id, s.quality]));
  const maxT = req.durationSec;

  const observations = r.observations
    .map((o) => {
      const ids = o.strokeIds.filter((id) => strokeIds.has(id));
      // Confidence can't exceed the best tracking quality of the strokes it cites.
      const best = ids.reduce<Confidence>((acc, id) => (ORDER.indexOf(quality.get(id) ?? "low") > ORDER.indexOf(acc) ? (quality.get(id) ?? "low") : acc), "low");
      const cap: Confidence = ids.length ? best : "low";
      const clampT = (t: number | null) => (t === null || !Number.isFinite(t) ? null : Math.min(Math.max(0, t), maxT));
      return {
        ...o,
        strokeIds: ids,
        finding: clip(o.finding, 600),
        evidence: o.evidence.slice(0, 5).map((e) => clip(e, 400)),
        whyItMatters: clip(o.whyItMatters, 500),
        improvement: clip(o.improvement, 600),
        drillId: validDrill(o.drillId),
        confidence: minConf(o.confidence, cap),
        timestampStart: clampT(o.timestampStart),
        timestampEnd: clampT(o.timestampEnd),
      };
    })
    // An observation with no valid evidence and no stroke reference is dropped.
    .filter((o) => o.evidence.length > 0)
    .slice(0, 12);

  const obsIds = new Set(observations.map((o) => o.id));
  return {
    summary: clip(r.summary, 1200),
    whatWentWell: r.whatWentWell.slice(0, 5).map((s) => clip(s, 300)),
    observations,
    topPriorities: r.topPriorities.filter((p) => obsIds.has(p.observationId)).slice(0, 3),
    categoryNotes: r.categoryNotes.slice(0, 8).map((c) => ({ ...c, note: clip(c.note, 300) })),
    limitations: r.limitations.slice(0, 8).map((s) => clip(s, 300)),
    inconclusive: r.inconclusive.slice(0, 8).map((s) => clip(s, 300)),
    recommendedNextSteps: r.recommendedNextSteps.slice(0, 5).map((s) => clip(s, 300)),
  };
}

export function sanitizeChat(a: ChatAnswer, req: ChatRequest): ChatAnswer {
  const sessions = new Map(req.context.sessions.map((s) => [s.id, s]));
  const knownStrokes = new Set(req.context.sessions.flatMap((s) => s.findings.flatMap((f) => f.strokeIds)));
  return {
    answer: clip(a.answer, 1500),
    details: a.details ? clip(a.details, 4000) : null,
    references: a.references
      .filter((r) => sessions.has(r.sessionId))
      .map((r) => ({
        ...r,
        strokeId: r.strokeId && knownStrokes.has(r.strokeId) ? r.strokeId : null,
        timestamp: r.timestamp !== null && Number.isFinite(r.timestamp) && r.timestamp >= 0 ? r.timestamp : null,
        label: clip(r.label, 120),
      }))
      .slice(0, 6),
    followUps: a.followUps.slice(0, 3).map((f) => clip(f, 140)),
    usedSessionData: a.usedSessionData && req.context.sessions.length > 0,
  };
}

export function sanitizePlan(p: PlanResponse): PlanResponse {
  return {
    title: clip(p.title, 120),
    rationale: clip(p.rationale, 1000),
    weeklyGoals: p.weeklyGoals.slice(0, 5).map((g) => clip(g, 200)),
    days: p.days.slice(0, 7).map((d) => ({
      day: clip(d.day, 20),
      focus: clip(d.focus, 120),
      warmup: clip(d.warmup, 300),
      drillIds: d.drillIds.filter((id) => DRILL_IDS.includes(id)).slice(0, 5),
      notes: clip(d.notes, 400),
    })),
  };
}

export function sanitizeComparison(c: Comparison): Comparison {
  return {
    summary: clip(c.summary, 800),
    differences: c.differences.slice(0, 10).map((d) => ({ ...d, evidence: clip(d.evidence, 400) })),
    caveats: c.caveats.slice(0, 6).map((s) => clip(s, 300)),
  };
}
