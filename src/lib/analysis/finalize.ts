"use client";

// Turns a finished capture (live or uploaded) into a stored session: full-sequence analysis,
// pose trace, key frames, recording (subject to retention settings) and an optional AI job.

import { analyzeSequence } from "../cv/pipeline";
import type { FeatureFrame } from "../cv/features";
import type { PoseFrame } from "../cv/landmarks";
import { encodeTrace } from "../cv/trace";
import type { DataStore } from "../data/store";
import type { KeyFrame, SessionRecord, Settings, StrokeRecord } from "../data/types";
import type { CameraView, Category, Handedness, SessionStrokeSelection } from "../tennis/types";
import { STROKE_LABEL } from "../tennis/labels";
import { enqueueReport } from "./jobs";

export interface CaptureResult {
  id: string;
  source: "live" | "upload";
  mode: SessionRecord["mode"];
  selection: SessionStrokeSelection;
  view: CameraView;
  handedness: Handedness;
  mirrored: boolean;
  focus: Category | null;
  drillId: string | null;
  startedAt: number;
  durationMs: number;
  poseFrames: PoseFrame[];
  features: FeatureFrame[];
  /** key frames captured live, keyed by approximate contact time */
  liveKeyFrames: { contactT: number; frames: KeyFrame[] }[];
  recording: Blob | null;
  videoSize: { w: number; h: number } | null;
  liveCues: SessionRecord["liveCues"];
  /** optional key-frame extractor for uploads (seeks the source video) */
  extractKeyFrames?: (stroke: StrokeRecord) => Promise<KeyFrame[]>;
  /** manual stroke-count correction from drill mode */
  notes?: string;
}

export function sessionTitle(selection: SessionStrokeSelection, source: "live" | "upload", at: number): string {
  const what = selection === "auto" ? "Practice" : selection === "footwork" ? "Footwork" : `${STROKE_LABEL[selection as keyof typeof STROKE_LABEL] ?? selection}`;
  const when = new Date(at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${what} · ${when}${source === "upload" ? " · video" : ""}`;
}

export async function finalizeCapture(store: DataStore, c: CaptureResult, settings: Settings): Promise<SessionRecord> {
  const analysis = analyzeSequence(c.features, { view: c.view, selection: c.selection });
  const valid = c.features.filter((f) => f.valid);

  // attach key frames
  for (const s of analysis.strokes) {
    let frames: KeyFrame[] = [];
    const live = c.liveKeyFrames.find((k) => Math.abs(k.contactT - s.contactT) < 350);
    if (live) frames = live.frames;
    else if (c.extractKeyFrames) frames = await c.extractKeyFrames(s).catch(() => []);
    if (frames.length) {
      await store.putKeyFrames(c.id, s.id, frames);
      s.keyFrameTimes = frames.map((f) => f.t);
    }
  }

  const keepVideo = c.recording && settings.retention !== "never_record";
  const session: SessionRecord = {
    id: c.id,
    title: sessionTitle(c.selection, c.source, c.startedAt),
    createdAt: Date.now(),
    startedAt: c.startedAt,
    endedAt: c.startedAt + c.durationMs,
    durationMs: c.durationMs,
    source: c.source,
    mode: c.mode,
    selection: c.selection,
    cameraView: c.view,
    handedness: c.handedness,
    mirrored: c.mirrored,
    focus: c.focus,
    drillId: c.drillId,
    status: "complete",
    analysisStatus: "local",
    analysisError: null,
    hasRecording: Boolean(keepVideo),
    recordingMime: keepVideo ? c.recording!.type : null,
    recordingCloudPath: null,
    videoSize: c.videoSize,
    trackedFraction: c.features.length ? valid.length / c.features.length : 0,
    avgVisibility: valid.length ? valid.reduce((s, f) => s + f.vis.overall, 0) / valid.length : 0,
    strokes: analysis.strokes,
    localReport: analysis.report,
    report: null,
    reportMeta: null,
    selectedGoal: null,
    notes: c.notes ?? "",
    favorite: false,
    liveCues: c.liveCues,
  };

  if (c.poseFrames.length) await store.putTrace(c.id, encodeTrace(c.poseFrames));
  if (keepVideo) await store.putRecording(c.id, c.recording!);
  await store.saveSession(session);

  // Optional private cloud copy (signed-in + opted in).
  if (keepVideo && settings.cloudVideo && "uploadRecording" in store) {
    try {
      const path = await (store as unknown as { uploadRecording: (id: string, b: Blob) => Promise<string> }).uploadRecording(c.id, c.recording!);
      session.recordingCloudPath = path;
      await store.saveSession(session);
    } catch (e) {
      console.warn("[finalize] cloud upload failed", e instanceof Error ? e.message : e);
    }
  }

  if (settings.autoAnalyze && session.strokes.length) await enqueueReport(store, session.id);
  return session;
}
