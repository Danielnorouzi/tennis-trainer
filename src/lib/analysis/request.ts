// Builds the (bounded, cost-aware) request sent to /api/ai/report from a stored session.
// Only a handful of strokes and key frames are sampled — never the full video.

import type { AnalyzeRequest, StrokeInputT } from "../ai/schemas";
import type { DataStore } from "../data/store";
import type { Profile, SessionRecord, Settings, StrokeRecord } from "../data/types";

export const MAX_STROKES_FOR_AI = 8;
export const MAX_IMAGES_FOR_AI = 20;

const QUALITY_RANK = { high: 3, medium: 2, low: 1 } as const;

/**
 * Pick strokes worth sending: those cited by findings first, then the best-tracked strokes,
 * spread across stroke types so a mixed session isn't represented by one stroke type only.
 */
export function selectStrokes(session: SessionRecord, max = MAX_STROKES_FOR_AI): StrokeRecord[] {
  const active = session.strokes.filter((s) => !s.excluded);
  const cited = new Set((session.localReport?.findings ?? []).filter((f) => f.severity !== "ok").flatMap((f) => f.strokeIds));
  const scored = active
    .map((s) => ({ s, score: (cited.has(s.id) ? 10 : 0) + QUALITY_RANK[s.quality] * 2 + (s.keyFrameTimes.length ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  const byType = new Map<string, StrokeRecord[]>();
  for (const { s } of scored) byType.set(s.type, [...(byType.get(s.type) ?? []), s]);
  const picked: StrokeRecord[] = [];
  // round-robin across types
  while (picked.length < Math.min(max, active.length)) {
    let added = false;
    for (const list of byType.values()) {
      const next = list.shift();
      if (next) {
        picked.push(next);
        added = true;
        if (picked.length >= max) break;
      }
    }
    if (!added) break;
  }
  return picked.sort((a, b) => a.t0 - b.t0);
}

export async function buildAnalyzeRequest(opts: {
  store: DataStore;
  session: SessionRecord;
  profile: Profile;
  settings: Settings;
  previous: SessionRecord[];
}): Promise<AnalyzeRequest> {
  const { store, session, profile, settings, previous } = opts;
  const strokes = selectStrokes(session);
  const imagesPerStroke = settings.aiFrames ? Math.max(1, Math.min(4, Math.floor(MAX_IMAGES_FOR_AI / Math.max(1, strokes.length)))) : 0;

  const strokeInputs: StrokeInputT[] = [];
  for (const s of strokes) {
    let frames: StrokeInputT["frames"] = [];
    if (imagesPerStroke > 0) {
      const kf = await store.getKeyFrames(session.id, s.id);
      // prefer loading + contact + follow-through when we must drop frames
      const order = ["contact (estimated)", "loading", "follow_through", "preparation"];
      frames = [...kf]
        .sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase))
        .slice(0, imagesPerStroke)
        .sort((a, b) => a.t - b.t)
        .map((f) => ({ t: f.t, phase: f.phase, image: f.dataUrl }));
    }
    strokeInputs.push({
      id: s.id,
      type: s.type,
      typeSource: s.typeSource,
      typeConfidence: s.typeConfidence,
      t0: s.t0,
      t1: s.t1,
      contactT: s.contactT,
      quality: s.quality,
      phases: s.phases,
      metrics: s.metrics.map((m) => ({ key: m.key, label: m.label, value: m.value, unit: m.unit, confidence: m.confidence, method: m.method })),
      frames,
    });
  }

  const prevWithReport = previous.filter((p) => p.id !== session.id && p.report).slice(0, 1)[0];
  return {
    sessionId: session.id,
    player: {
      experience: profile.experience,
      handedness: profile.handedness,
      backhand: profile.backhand,
      goals: profile.goals.slice(0, 10),
      challenges: profile.challenges.slice(0, 10),
    },
    selection: session.selection,
    cameraView: session.cameraView,
    durationSec: Math.max(0, session.durationMs / 1000),
    trackedFraction: Math.min(1, Math.max(0, session.trackedFraction)),
    strokes: strokeInputs,
    localFindings: (session.localReport?.findings ?? []).slice(0, 40).map((f) => ({
      title: f.title,
      category: f.category,
      severity: f.severity,
      confidence: f.confidence,
      evidence: f.evidence.slice(0, 6).map((e) => e.slice(0, 400)),
      strokeIds: f.strokeIds.filter((id) => strokes.some((s) => s.id === id)).slice(0, 60),
    })),
    limitations: (session.localReport?.limitations ?? []).slice(0, 12),
    previousObjectives: prevWithReport?.report?.topPriorities.map((p) => p.title).slice(0, 6) ?? [],
    previousSummary: prevWithReport?.report?.summary.slice(0, 1500) ?? null,
    notes: session.notes ? session.notes.slice(0, 1000) : null,
  };
}
