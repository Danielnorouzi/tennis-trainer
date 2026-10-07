// Temporal stroke segmentation from the dominant-wrist speed signal.
//
// A stroke is anchored on a peak of wrist speed (the arm is fastest close to contact). From that
// anchor we walk backwards to find when the preparation began and the backswing turned around
// (loading), and forwards to find the end of the follow-through and the moment the player settled
// again (recovery). Ball contact is NOT observed — the contact window is an estimate derived from
// the speed peak and is always labelled as such.

import { SEGMENT } from "./config";
import type { FeatureFrame } from "./features";
import type { Phase } from "../tennis/types";

export interface StrokeWindow {
  readyStart: number;
  prepStart: number;
  loadStart: number;
  loadT: number;
  contactT: number;
  followEnd: number;
  recoveryEnd: number;
  /** false when the player never visibly settled before the next stroke / end of footage */
  recoveryObserved: boolean;
  peakSpeed: number;
  /** fraction of valid (tracked) frames inside [prepStart, followEnd] */
  validFraction: number;
  /** mean overall landmark visibility inside the window */
  visibility: number;
  phases: Phase[];
}

export interface SegmentOptions {
  peakSpeed?: number;
  /** strokes that end before this time are ignored (used by the streaming segmenter) */
  after?: number;
}

function indexAtOrBefore(frames: FeatureFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (frames[m].t <= t) lo = m;
    else hi = m - 1;
  }
  return lo;
}

/** Local maxima of wrist speed above the peak threshold, at least minGapMs apart (strongest wins). */
export function findSpeedPeaks(frames: FeatureFrame[], peakSpeed: number = SEGMENT.peakSpeed): number[] {
  const cands: number[] = [];
  for (let i = 1; i < frames.length - 1; i++) {
    const s = frames[i].wristSpeed;
    if (!frames[i].valid || s < peakSpeed) continue;
    if (s >= frames[i - 1].wristSpeed && s >= frames[i + 1].wristSpeed) cands.push(i);
  }
  cands.sort((a, b) => frames[b].wristSpeed - frames[a].wristSpeed);
  const kept: number[] = [];
  for (const i of cands) {
    if (kept.every((k) => Math.abs(frames[k].t - frames[i].t) >= SEGMENT.minGapMs)) kept.push(i);
  }
  return kept.sort((a, b) => a - b);
}

function buildPhases(w: Omit<StrokeWindow, "phases">): Phase[] {
  const approx = w.visibility < 0.7 || w.validFraction < 0.85;
  const c0 = w.contactT - SEGMENT.contactHalfMs;
  const c1 = w.contactT + SEGMENT.contactHalfMs;
  const phases: Phase[] = [
    { name: "ready", start: w.readyStart, end: w.prepStart, estimated: approx },
    { name: "preparation", start: w.prepStart, end: w.loadStart, estimated: approx },
    { name: "loading", start: w.loadStart, end: w.loadT, estimated: true },
    { name: "acceleration", start: w.loadT, end: Math.max(w.loadT, c0), estimated: approx },
    // Contact is never verified from the skeleton alone.
    { name: "contact", start: c0, end: c1, estimated: true },
    { name: "follow_through", start: c1, end: Math.max(c1, w.followEnd), estimated: approx },
    { name: "recovery", start: w.followEnd, end: w.recoveryEnd, estimated: approx || !w.recoveryObserved },
  ];
  return phases.filter((p) => p.end > p.start);
}

/**
 * Segment a complete feature sequence into stroke windows. Pure and deterministic, so it is used
 * both offline (uploaded video) and by the streaming segmenter on a rolling buffer.
 */
export function segmentStrokes(frames: FeatureFrame[], opts: SegmentOptions = {}): StrokeWindow[] {
  if (frames.length < 5) return [];
  const peaks = findSpeedPeaks(frames, opts.peakSpeed);
  const out: StrokeWindow[] = [];
  let prevEnd = -Infinity;

  for (let pi = 0; pi < peaks.length; pi++) {
    const p = peaks[pi];
    const peakT = frames[p].t;
    const nextPeakT = pi + 1 < peaks.length ? frames[peaks[pi + 1]].t : Infinity;

    // --- walk back: start of preparation -------------------------------------------------
    const minPrepT = Math.max(peakT - SEGMENT.maxPrepMs, prevEnd);
    let prepIdx = p;
    let quiet = 0;
    for (let i = p - 1; i >= 0 && frames[i].t >= minPrepT; i--) {
      prepIdx = i;
      if (frames[i].wristSpeed < SEGMENT.prepSpeed) {
        quiet += 1;
        if (quiet >= 3) {
          prepIdx = i + 2;
          break;
        }
      } else quiet = 0;
    }
    const prepStart = frames[Math.min(prepIdx, p)].t;

    // --- loading: speed minimum where the backswing turns into the forward swing ----------
    let loadIdx = -1;
    let minS = Infinity;
    const loadFrom = Math.max(prepStart, peakT - 700);
    for (let i = p - 1; i >= 0 && frames[i].t >= loadFrom; i--) {
      if (frames[i].t > peakT - 80) continue;
      if (frames[i].wristSpeed < minS) {
        minS = frames[i].wristSpeed;
        loadIdx = i;
      }
    }
    const loadT = loadIdx >= 0 ? frames[loadIdx].t : Math.max(prepStart, peakT - 250);
    const loadStart = Math.max(prepStart, loadT - Math.min(250, (loadT - prepStart) / 2));

    // --- walk forward: end of follow-through ----------------------------------------------
    let followIdx = p;
    quiet = 0;
    for (let i = p + 1; i < frames.length && frames[i].t <= peakT + SEGMENT.maxFollowMs && frames[i].t < nextPeakT; i++) {
      followIdx = i;
      if (frames[i].wristSpeed < SEGMENT.activeSpeed) {
        quiet += 1;
        if (quiet >= 2) break;
      } else quiet = 0;
    }
    const followEnd = frames[followIdx].t;

    // --- recovery: hips and arm settle for settleMs ---------------------------------------
    let recoveryEnd = followEnd;
    let recoveryObserved = false;
    let settledSince: number | null = null;
    const recLimit = Math.min(followEnd + SEGMENT.maxRecoveryMs, nextPeakT - SEGMENT.maxPrepMs / 2);
    for (let i = followIdx + 1; i < frames.length && frames[i].t <= recLimit; i++) {
      const f = frames[i];
      recoveryEnd = f.t;
      const still = f.valid && f.wristSpeed < SEGMENT.restSpeed && Math.abs(f.comSpeedX) < 0.6;
      if (still) {
        settledSince ??= f.t;
        if (f.t - settledSince >= SEGMENT.settleMs) {
          recoveryObserved = true;
          recoveryEnd = settledSince;
          break;
        }
      } else settledSince = null;
    }

    if (opts.after !== undefined && followEnd <= opts.after) {
      prevEnd = recoveryEnd;
      continue;
    }

    // --- quality of the window --------------------------------------------------------------
    const i0 = indexAtOrBefore(frames, prepStart);
    const i1 = indexAtOrBefore(frames, followEnd);
    let valid = 0;
    let visSum = 0;
    for (let i = i0; i <= i1; i++) {
      if (frames[i].valid) valid += 1;
      visSum += frames[i].vis.overall;
    }
    const n = Math.max(1, i1 - i0 + 1);
    const validFraction = valid / n;
    if (validFraction < SEGMENT.minValidFraction) {
      prevEnd = recoveryEnd;
      continue;
    }

    const readyStart = Math.max(prepStart - SEGMENT.readyLeadMs, prevEnd, frames[0].t);
    const base = {
      readyStart,
      prepStart,
      loadStart,
      loadT,
      contactT: peakT,
      followEnd,
      recoveryEnd,
      recoveryObserved,
      peakSpeed: frames[p].wristSpeed,
      validFraction,
      visibility: visSum / n,
    };
    out.push({ ...base, phases: buildPhases(base) });
    prevEnd = recoveryEnd;
  }
  return out;
}

/**
 * For overhead strokes (serve, smash) the best body-only contact estimate is the highest point of
 * the hitting hand near the speed peak, not the peak itself. Returns a window with the contact
 * moment and phases moved accordingly (still marked as estimated).
 */
export function refineOverheadContact(frames: FeatureFrame[], w: StrokeWindow): StrokeWindow {
  const near = framesBetween(frames, w.contactT - 350, w.contactT + 100).filter((f) => f.valid);
  if (!near.length) return w;
  const top = near.reduce((a, b) => (b.domWristHeight > a.domWristHeight ? b : a));
  if (top.t === w.contactT) return w;
  const loadT = Math.min(w.loadT, top.t - 80);
  const base = { ...w, contactT: top.t, loadT, loadStart: Math.min(w.loadStart, loadT), followEnd: Math.max(w.followEnd, top.t + SEGMENT.contactHalfMs + 1) };
  const { phases: _old, ...rest } = base;
  void _old;
  return { ...rest, phases: buildPhases(rest) };
}

/** Frames inside [t0, t1]. */
export function framesBetween(frames: FeatureFrame[], t0: number, t1: number): FeatureFrame[] {
  return frames.filter((f) => f.t >= t0 && f.t <= t1);
}

export type LivePhase = "setup" | "ready" | "preparation" | "swing" | "follow_through" | "recovery";

/**
 * Streaming wrapper for live coaching: keeps a rolling buffer, reports a coarse live phase every
 * frame, and emits finalised stroke windows once the follow-through has clearly ended.
 */
export class LiveSegmenter {
  private buf: FeatureFrame[] = [];
  private lastEmittedEnd = -Infinity;
  private lastPeakT = -Infinity;
  private phase: LivePhase = "setup";

  constructor(private readonly bufferMs = 7000) {}

  get livePhase(): LivePhase {
    return this.phase;
  }

  /** Frames currently held (read-only use). */
  get frames(): readonly FeatureFrame[] {
    return this.buf;
  }

  reset(): void {
    this.buf = [];
    this.lastEmittedEnd = -Infinity;
    this.lastPeakT = -Infinity;
    this.phase = "setup";
  }

  push(f: FeatureFrame): StrokeWindow[] {
    this.buf.push(f);
    while (this.buf.length && f.t - this.buf[0].t > this.bufferMs) this.buf.shift();

    // coarse live phase for the HUD
    if (!f.valid) this.phase = "setup";
    else if (f.wristSpeed >= SEGMENT.peakSpeed) {
      this.phase = "swing";
      this.lastPeakT = f.t;
    } else if (f.t - this.lastPeakT < 450) this.phase = f.wristSpeed >= SEGMENT.activeSpeed ? "follow_through" : "recovery";
    else if (f.t - this.lastPeakT < 1500) this.phase = "recovery";
    else this.phase = f.wristSpeed >= SEGMENT.prepSpeed ? "preparation" : "ready";

    // finalise once the arm has been calm for a while after a peak (or enough time passed)
    const sincePeak = f.t - this.lastPeakT;
    if (!Number.isFinite(this.lastPeakT) || sincePeak < 700) return [];
    const done = segmentStrokes(this.buf, { after: this.lastEmittedEnd }).filter(
      (w) => w.contactT > this.lastEmittedEnd && (w.recoveryObserved || f.t - w.followEnd > SEGMENT.maxRecoveryMs * 0.6),
    );
    if (done.length) this.lastEmittedEnd = done[done.length - 1].followEnd;
    return done;
  }
}
