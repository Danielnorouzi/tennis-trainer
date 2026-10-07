// Progress analytics over stored sessions. Comparisons are only made between equivalent
// measurements: same stroke type, same camera view, same measurement method, and adequate
// confidence. Anything else is reported as "not comparable" rather than silently charted.

import { median, round } from "../cv/geometry";
import type { SessionRecord } from "../data/types";
import type { CameraView, Confidence, Measurement, StrokeType } from "../tennis/types";

export type Direction = "higher" | "lower" | "neutral";

/** Which way is "better" for each tracked metric (neutral = no value judgement). */
export const METRIC_META: Record<string, { label: string; better: Direction; unit: Measurement["unit"] }> = {
  turn_ratio_at_load: { label: "Turn completed by end of backswing", better: "higher", unit: "%" },
  turn_lead_s: { label: "Unit turn lead time", better: "higher", unit: "s" },
  shoulder_turn_deg: { label: "Shoulder turn (estimate)", better: "neutral", unit: "deg" },
  min_knee_deg: { label: "Most-bent knee angle", better: "lower", unit: "deg" },
  finish_head_offset: { label: "Head offset at finish", better: "lower", unit: "torso" },
  finish_lean_deg: { label: "Trunk lean at finish", better: "lower", unit: "deg" },
  recovery_s: { label: "Time to settle after finish", better: "lower", unit: "s" },
  prep_to_contact_s: { label: "Preparation → contact", better: "neutral", unit: "s" },
  elbow_at_contact_deg: { label: "Elbow angle near contact", better: "neutral", unit: "deg" },
  trophy_elbow_height: { label: "Elbow height at trophy", better: "higher", unit: "torso" },
  contact_reach: { label: "Reach at contact", better: "higher", unit: "torso" },
  toss_arm_hold_s: { label: "Tossing arm held until", better: "lower", unit: "s" },
};

const CONF_OK: Confidence[] = ["medium", "high"];

export interface SeriesPoint {
  sessionId: string;
  date: number;
  value: number;
  n: number;
}

export interface MetricSeries {
  key: string;
  label: string;
  strokeType: StrokeType;
  view: CameraView;
  method: Measurement["method"];
  unit: Measurement["unit"];
  better: Direction;
  points: SeriesPoint[];
}

/** Median of a metric per session, grouped into comparable series. */
export function buildSeries(sessions: SessionRecord[], minConfidence: Confidence[] = CONF_OK): MetricSeries[] {
  const groups = new Map<string, MetricSeries>();
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  for (const s of sorted) {
    const perKey = new Map<string, { vals: number[]; method: Measurement["method"]; unit: Measurement["unit"]; type: StrokeType }>();
    for (const st of s.strokes) {
      if (st.excluded || st.type === "unknown") continue;
      for (const m of st.metrics) {
        if (!METRIC_META[m.key] || !minConfidence.includes(m.confidence)) continue;
        const gk = `${m.key}|${st.type}|${s.cameraView}|${m.method}`;
        const e = perKey.get(gk) ?? { vals: [], method: m.method, unit: m.unit, type: st.type };
        e.vals.push(m.value);
        perKey.set(gk, e);
      }
    }
    for (const [gk, e] of perKey) {
      const [key] = gk.split("|");
      const g = groups.get(gk) ?? {
        key, label: METRIC_META[key].label, strokeType: e.type, view: s.cameraView, method: e.method, unit: e.unit, better: METRIC_META[key].better, points: [],
      };
      g.points.push({ sessionId: s.id, date: s.startedAt, value: round(median(e.vals), 2), n: e.vals.length });
      groups.set(gk, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.points.length - a.points.length);
}

export interface Comparability {
  comparable: boolean;
  reasons: string[];
}

export function compareSessions(a: SessionRecord, b: SessionRecord, strokeType?: StrokeType): Comparability {
  const reasons: string[] = [];
  if (a.cameraView !== b.cameraView) reasons.push(`Different camera views (${a.cameraView} vs ${b.cameraView}).`);
  if (strokeType) {
    const has = (s: SessionRecord) => s.strokes.some((x) => x.type === strokeType && !x.excluded);
    if (!has(a) || !has(b)) reasons.push(`Both sessions need ${strokeType.replace("_", " ")}s.`);
  }
  const low = (s: SessionRecord) => s.trackedFraction < 0.6;
  if (low(a) || low(b)) reasons.push("Tracking quality was low in at least one session.");
  return { comparable: reasons.length === 0, reasons };
}

export interface Improvement {
  key: string;
  message: string;
  strokeType: StrokeType;
}

/**
 * Celebrate only real, consistent improvements: the last three comparable sessions must all be
 * better than the median of the earlier ones, by a meaningful margin. Never fabricated.
 */
export function findImprovements(series: MetricSeries[]): Improvement[] {
  const out: Improvement[] = [];
  for (const s of series) {
    if (s.better === "neutral" || s.points.length < 5) continue;
    const recent = s.points.slice(-3);
    const before = s.points.slice(0, -3);
    const base = median(before.map((p) => p.value));
    const sign = s.better === "higher" ? 1 : -1;
    const margin = Math.max(Math.abs(base) * 0.08, 0.02);
    if (recent.every((p) => sign * (p.value - base) > margin)) {
      out.push({
        key: s.key,
        strokeType: s.strokeType,
        message: `Your ${s.label.toLowerCase()} on ${s.strokeType.replace("_", " ")}s was better than your earlier baseline in each of your last three comparable sessions (${s.view} view).`,
      });
    }
  }
  return out;
}

/** Sessions and minutes per day for the last `days` days (oldest first). */
export function weeklyActivity(sessions: SessionRecord[], days = 7, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const out = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { date: d.getTime(), label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2), sessions: 0, minutes: 0, strokes: 0 };
  });
  for (const s of sessions) {
    const idx = Math.floor((s.startedAt - start.getTime()) / 86_400_000);
    if (idx < 0 || idx >= days) continue;
    out[idx].sessions += 1;
    out[idx].minutes += s.durationMs / 60_000;
    out[idx].strokes += s.strokes.filter((x) => !x.excluded).length;
  }
  return out.map((d) => ({ ...d, minutes: round(d.minutes, 1) }));
}

/** Consecutive weeks (including this one) with at least one session — a gentle consistency streak. */
export function weekStreak(sessions: SessionRecord[], now = Date.now()): number {
  const week = (t: number) => Math.floor((t - 4 * 86_400_000) / (7 * 86_400_000)); // Monday-based
  const weeks = new Set(sessions.map((s) => week(s.startedAt)));
  let w = week(now);
  if (!weeks.has(w)) w -= 1; // this week not started yet is fine
  let n = 0;
  while (weeks.has(w)) {
    n += 1;
    w -= 1;
  }
  return n;
}

/** Findings that recur across sessions (local rules), counted by rule id. */
export function recurringFindings(sessions: SessionRecord[], lastN = 8) {
  const counts = new Map<string, { title: string; category: string; count: number; confidence: Confidence; lastSeen: number; drillId: string | null }>();
  for (const s of sessions.slice(0, lastN)) {
    for (const f of s.localReport?.findings ?? []) {
      if (f.severity !== "issue" && f.severity !== "watch") continue;
      const k = f.ruleId ?? f.title;
      const e = counts.get(k) ?? { title: f.title, category: f.category, count: 0, confidence: f.confidence, lastSeen: 0, drillId: f.drillId };
      e.count += 1;
      e.lastSeen = Math.max(e.lastSeen, s.startedAt);
      if (f.confidence === "high" || (f.confidence === "medium" && e.confidence === "low")) e.confidence = f.confidence;
      counts.set(k, e);
    }
  }
  return [...counts.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen);
}
