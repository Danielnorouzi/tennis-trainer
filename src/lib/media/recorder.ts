"use client";

// MediaRecorder wrapper with codec negotiation (Safari records MP4, Chromium/Firefox WebM),
// pause/resume, and chunked collection so an interrupted session still yields a playable file.

const CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of CANDIDATES) if (MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

export class SessionRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  readonly mimeType: string;

  constructor(private stream: MediaStream) {
    const mime = pickMimeType();
    if (mime === null) throw new Error("Recording is not supported in this browser.");
    this.mimeType = mime;
  }

  start(): void {
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, {
      ...(this.mimeType ? { mimeType: this.mimeType } : {}),
      videoBitsPerSecond: 2_500_000,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    // 1 s timeslices: if the tab is closed mid-session, most of the recording is already collected.
    this.rec.start(1000);
  }

  pause(): void {
    if (this.rec?.state === "recording") this.rec.pause();
  }

  resume(): void {
    if (this.rec?.state === "paused") this.rec.resume();
  }

  get state(): RecordingState | "idle" {
    return this.rec?.state ?? "idle";
  }

  stop(): Promise<Blob | null> {
    const rec = this.rec;
    if (!rec || rec.state === "inactive") return Promise.resolve(this.chunks.length ? new Blob(this.chunks, { type: this.blobType() }) : null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: this.blobType() }) : null);
      rec.stop();
    });
  }

  private blobType(): string {
    return (this.mimeType || this.rec?.mimeType || "video/webm").split(";")[0];
  }
}

/**
 * Chromium's MediaRecorder WebM files have no duration header, so `duration` is Infinity until the
 * browser scans the file. Seeking far ahead forces that scan.
 */
export async function ensureDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("durationchange", onChange);
      video.currentTime = 0;
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onChange = () => {
      if (Number.isFinite(video.duration)) done();
    };
    video.addEventListener("durationchange", onChange);
    video.currentTime = 1e7;
    setTimeout(done, 3000);
  });
}
