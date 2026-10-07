// Compiles the player's OWN session data into a compact, bounded context for the AI coach.
// Only data from the current user's store is ever included.

import { median, round } from "../cv/geometry";
import type { ChatRequest } from "../ai/schemas";
import type { DrillLog, Goal, SessionRecord } from "../data/types";

export function buildChatContext(sessions: SessionRecord[], goals: Goal[], drillLog: DrillLog[]): ChatRequest["context"] {
  return {
    sessions: sessions.slice(0, 12).map((s) => {
      const strokeCounts: Record<string, number> = {};
      for (const st of s.strokes) if (!st.excluded) strokeCounts[st.type] = (strokeCounts[st.type] ?? 0) + 1;
      const byKey = new Map<string, { label: string; unit: string; vals: number[] }>();
      for (const st of s.strokes) {
        if (st.excluded) continue;
        for (const m of st.metrics) {
          if (m.confidence === "low") continue;
          const e = byKey.get(m.key) ?? { label: m.label, unit: m.unit, vals: [] };
          e.vals.push(m.value);
          byKey.set(m.key, e);
        }
      }
      const findings = [...(s.report?.observations ?? []).map((o) => ({
        title: o.finding.slice(0, 200), severity: o.priority === "high" ? "issue" : "watch", confidence: o.confidence,
        strokeIds: o.strokeIds.slice(0, 10), t: o.timestampStart,
      })),
      ...(s.localReport?.findings ?? []).filter((f) => f.severity !== "insufficient").map((f) => ({
        title: f.title.slice(0, 200), severity: f.severity, confidence: f.confidence, strokeIds: f.strokeIds.slice(0, 10),
        t: f.t0 !== null ? round(f.t0 / 1000, 2) : null,
      }))].slice(0, 15);
      return {
        id: s.id,
        date: new Date(s.startedAt).toISOString().slice(0, 10),
        title: s.title.slice(0, 120),
        selection: s.selection,
        cameraView: s.cameraView,
        strokeCounts,
        summary: s.report?.summary.slice(0, 1500) ?? null,
        findings,
        keyMetrics: [...byKey.entries()].slice(0, 20).map(([key, e]) => ({ key, label: e.label.slice(0, 160), median: round(median(e.vals), 2), unit: e.unit, n: e.vals.length })),
      };
    }),
    goals: goals.filter((g) => g.active).map((g) => g.title.slice(0, 200)).slice(0, 10),
    drillLog: drillLog.slice(0, 30).map((l) => ({ drillId: l.drillId, date: new Date(l.completedAt).toISOString().slice(0, 10) })),
  };
}
