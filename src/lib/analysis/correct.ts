"use client";

// User corrections: change a stroke's type (recomputing type-specific measurements from the
// stored pose trace) or exclude a false detection, then rebuild the session findings.

import { FeatureTracker, type FeatureFrame } from "../cv/features";
import { buildStroke, rebuildFindings } from "../cv/pipeline";
import { segmentStrokes } from "../cv/segmentation";
import { decodeTrace } from "../cv/trace";
import type { DataStore } from "../data/store";
import type { SessionRecord } from "../data/types";
import type { StrokeType } from "../tennis/types";

async function featuresFor(store: DataStore, s: SessionRecord): Promise<FeatureFrame[] | null> {
  const buf = await store.getTrace(s.id);
  if (!buf) return null;
  const frames = decodeTrace(buf);
  const aspect = s.videoSize ? s.videoSize.w / s.videoSize.h : 16 / 9;
  const tracker = new FeatureTracker({ handedness: s.handedness, aspect });
  return frames.map((f) => tracker.push(f));
}

export async function correctStrokeType(store: DataStore, session: SessionRecord, strokeId: string, type: StrokeType): Promise<SessionRecord> {
  const feats = await featuresFor(store, session);
  const strokes = await Promise.all(
    session.strokes.map(async (st) => {
      if (st.id !== strokeId) return st;
      if (!feats) return { ...st, type, typeSource: "user_corrected" as const, typeConfidence: "high" as const };
      const windows = segmentStrokes(feats);
      const w = windows.reduce<(typeof windows)[number] | null>((best, x) => (!best || Math.abs(x.contactT - st.contactT) < Math.abs(best.contactT - st.contactT) ? x : best), null);
      if (!w || Math.abs(w.contactT - st.contactT) > 600) return { ...st, type, typeSource: "user_corrected" as const, typeConfidence: "high" as const };
      const rebuilt = buildStroke(feats, w, { view: session.cameraView, selection: session.selection }, st.index, type);
      return { ...rebuilt, id: st.id, keyFrameTimes: st.keyFrameTimes, excluded: st.excluded };
    }),
  );
  const next: SessionRecord = {
    ...session,
    strokes,
    localReport: session.localReport ? rebuildFindings(session.localReport, strokes) : null,
  };
  await store.saveSession(next);
  return next;
}

export async function setStrokeExcluded(store: DataStore, session: SessionRecord, strokeId: string, excluded: boolean): Promise<SessionRecord> {
  const strokes = session.strokes.map((s) => (s.id === strokeId ? { ...s, excluded } : s));
  const next: SessionRecord = { ...session, strokes, localReport: session.localReport ? rebuildFindings(session.localReport, strokes) : null };
  await store.saveSession(next);
  return next;
}
