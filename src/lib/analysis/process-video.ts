"use client";

// Offline analysis of an uploaded video entirely in the browser: seek frame-by-frame, run pose
// detection, and feed the same feature tracker used for live coaching. The video is never
// uploaded for tracking; only a few sampled key frames may later be sent to the AI coach.

import { FeatureTracker, type FeatureFrame } from "../cv/features";
import { unmirrorPose, type PoseFrame } from "../cv/landmarks";
import { PoseSmoother } from "../cv/smoothing";
import { loadVision, nextTimestamp as nextTs, toPoseFrame } from "../cv/vision";
import { grabFrame } from "../cv/keyframes";
import { ensureDuration } from "../media/recorder";
import type { Handedness } from "../tennis/types";
import type { KeyFrame, StrokeRecord } from "../data/types";

export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB (processed locally)
export const MAX_DURATION_SEC = 10 * 60;
export const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/3gpp"];

export class VideoValidationError extends Error {}

export function validateVideoFile(file: File): void {
  const okType = ACCEPTED_TYPES.includes(file.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
  if (!okType) throw new VideoValidationError("Unsupported file type. Use MP4, MOV, M4V or WebM.");
  if (file.size === 0) throw new VideoValidationError("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new VideoValidationError("The file is larger than 1 GB. Trim it to the strokes you want analysed.");
}

export async function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () =>
      reject(new VideoValidationError("This browser can't decode the video (some iPhone HEVC .mov files only play in Safari). Try exporting as MP4 (H.264)."));
  });
  await ensureDuration(video);
  return video;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = t;
  });
}

export interface ProcessProgress {
  phase: "loading_model" | "tracking" | "analysing";
  fraction: number;
}

export interface ProcessedVideo {
  poseFrames: PoseFrame[];
  features: FeatureFrame[];
  durationMs: number;
  size: { w: number; h: number };
  extractKeyFrames: (s: StrokeRecord) => Promise<KeyFrame[]>;
  dispose: () => void;
}

export async function processVideo(
  file: File,
  opts: { handedness: Handedness; mirrored: boolean; sampleFps?: number; signal?: AbortSignal; onProgress?: (p: ProcessProgress) => void },
): Promise<ProcessedVideo> {
  validateVideoFile(file);
  const url = URL.createObjectURL(file);
  try {
    const video = await loadVideoElement(url);
    const duration = video.duration;
    if (!duration) throw new VideoValidationError("Could not read the video's length.");
    if (duration > MAX_DURATION_SEC) throw new VideoValidationError("Videos longer than 10 minutes aren't supported yet — trim it first.");

    opts.onProgress?.({ phase: "loading_model", fraction: 0 });
    const vision = await loadVision(video);
    const fps = opts.sampleFps ?? (duration < 30 ? 30 : 20);
    const step = 1 / fps;
    const tracker = new FeatureTracker({ handedness: opts.handedness, aspect: video.videoWidth / video.videoHeight });
    const smoother = new PoseSmoother();
    const poseFrames: PoseFrame[] = [];
    const features: FeatureFrame[] = [];
    const empty = (t: number): PoseFrame => ({ t, image: Array.from({ length: 33 }, () => ({ x: 0, y: 0, v: 0 })), world: null, people: 0 });

    for (let t = 0; t < duration; t += step) {
      if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      await seek(video, t);
      const tMs = t * 1000;
      let pf = toPoseFrame(vision.landmarker.detectForVideo(video, nextTs()), tMs) ?? empty(tMs);
      if (opts.mirrored && pf.people) pf = unmirrorPose(pf);
      const smooth = pf.people ? smoother.smooth(pf) : pf;
      poseFrames.push(smooth);
      features.push(tracker.push(smooth));
      opts.onProgress?.({ phase: "tracking", fraction: Math.min(1, t / duration) });
      // yield so the UI (progress bar, cancel button) stays responsive
      if (poseFrames.length % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    opts.onProgress?.({ phase: "analysing", fraction: 1 });

    const extractKeyFrames = async (s: StrokeRecord): Promise<KeyFrame[]> => {
      const pick = (name: string) => s.phases.find((p) => p.name === name);
      const targets: [string, number][] = [];
      const prep = pick("preparation");
      if (prep) targets.push(["preparation", (prep.start + prep.end) / 2]);
      const load = pick("loading");
      if (load) targets.push(["loading", load.end]);
      targets.push(["contact (estimated)", s.contactT]);
      const ft = pick("follow_through");
      if (ft) targets.push(["follow_through", ft.end]);
      const out: KeyFrame[] = [];
      for (const [phase, t] of targets) {
        await seek(video, Math.max(0, Math.min(duration - 0.01, t / 1000)));
        const dataUrl = grabFrame(video);
        if (dataUrl) out.push({ t, phase, dataUrl });
      }
      return out;
    };

    return {
      poseFrames,
      features,
      durationMs: duration * 1000,
      size: { w: video.videoWidth, h: video.videoHeight },
      extractKeyFrames,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
