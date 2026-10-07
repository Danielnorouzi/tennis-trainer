"use client";

// Keeps the last ~3 seconds of small video frames in a ring of canvases so that, when a stroke
// is finalised, we can pick the frames nearest each phase (preparation, loading, contact estimate,
// follow-through) without seeking the recording. Only these few frames are ever sent to the AI.

import type { StrokeWindow } from "./segmentation";
import type { KeyFrame } from "../data/types";

export class FrameRing {
  private canvases: HTMLCanvasElement[] = [];
  private times: number[] = [];
  private next = 0;
  private lastT = -Infinity;

  constructor(
    private size = 36,
    private width = 480,
    private minIntervalMs = 85,
  ) {}

  /** Capture the current frame if enough time has passed. `mirror` flips horizontally to match the preview. */
  capture(video: HTMLVideoElement, t: number): void {
    if (t - this.lastT < this.minIntervalMs || !video.videoWidth) return;
    this.lastT = t;
    const h = Math.round((this.width * video.videoHeight) / video.videoWidth);
    let c = this.canvases[this.next];
    if (!c) {
      c = document.createElement("canvas");
      this.canvases[this.next] = c;
    }
    if (c.width !== this.width || c.height !== h) {
      c.width = this.width;
      c.height = h;
    }
    c.getContext("2d")?.drawImage(video, 0, 0, this.width, h);
    this.times[this.next] = t;
    this.next = (this.next + 1) % this.size;
  }

  private nearest(t: number): number {
    let best = -1;
    let bestD = Infinity;
    this.times.forEach((ft, i) => {
      const d = Math.abs(ft - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return bestD < 200 ? best : -1;
  }

  /** JPEG key frames for the phases of a finished stroke. */
  keyFramesFor(w: StrokeWindow, quality = 0.72): KeyFrame[] {
    const picks: [string, number][] = [
      ["preparation", (w.prepStart + w.loadStart) / 2],
      ["loading", w.loadT],
      ["contact (estimated)", w.contactT],
      ["follow_through", w.followEnd],
    ];
    const out: KeyFrame[] = [];
    for (const [phase, t] of picks) {
      const i = this.nearest(t);
      if (i < 0) continue;
      out.push({ t: this.times[i], phase, dataUrl: this.canvases[i].toDataURL("image/jpeg", quality) });
    }
    return out;
  }

  clear(): void {
    this.times = [];
    this.next = 0;
    this.lastT = -Infinity;
  }
}

/** Grab a single frame from a video element as a JPEG data URL (used for uploads and screenshots). */
export function grabFrame(video: HTMLVideoElement, width = 480, quality = 0.72): string | null {
  if (!video.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * video.videoHeight) / video.videoWidth);
  c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}
