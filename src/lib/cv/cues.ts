// Live cue scheduler. One major cue at a time, prioritised by confidence and importance, with
// per-cue cooldowns, repeat back-off, user-muted categories, focus mode, and a "quiet window"
// while the player is swinging (cues are held until the stroke has finished).

import { CUES } from "./config";
import type { Category, Confidence, Priority } from "../tennis/types";

export interface CueCandidate {
  key: string;
  text: string;
  category: Category | "setup";
  priority: Priority;
  confidence: Confidence;
  /** ms timestamp (performance clock) when the evidence was produced */
  at: number;
}

export interface IssuedCue extends CueCandidate {
  issuedAt: number;
}

export interface CueSchedulerOptions {
  muted?: Iterable<string>;
  focus?: Category | null;
  /** allow low-confidence cues (default false — live cues must be well supported) */
  allowLowConfidence?: boolean;
}

const P: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
const C: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export class CueScheduler {
  private lastByKey = new Map<string, number>();
  private countByKey = new Map<string, number>();
  private lastAny = -Infinity;
  private pending: CueCandidate[] = [];
  private muted: Set<string>;
  private focus: Category | null;
  private allowLow: boolean;

  constructor(opts: CueSchedulerOptions = {}) {
    this.muted = new Set(opts.muted ?? []);
    this.focus = opts.focus ?? null;
    this.allowLow = opts.allowLowConfidence ?? false;
  }

  setMuted(categories: Iterable<string>): void {
    this.muted = new Set(categories);
  }

  setFocus(focus: Category | null): void {
    this.focus = focus;
  }

  /** Offer a candidate; it may be dropped immediately if filtered. */
  offer(c: CueCandidate): void {
    if (this.muted.has(c.category)) return;
    if (this.focus && c.category !== "setup" && c.category !== this.focus) return;
    if (c.confidence === "low" && !this.allowLow) return;
    this.pending = this.pending.filter((p) => p.key !== c.key);
    this.pending.push(c);
  }

  private cooldownFor(key: string): number {
    const n = this.countByKey.get(key) ?? 0;
    return n >= CUES.repeatLimit ? CUES.repeatBackoffMs : CUES.perCueCooldownMs;
  }

  /**
   * Pick at most one cue to issue now. `busy` = the player is mid-swing or audio is playing.
   * Pending candidates older than 6 s are discarded (stale feedback is worse than none).
   */
  next(now: number, busy: boolean): IssuedCue | null {
    this.pending = this.pending.filter((c) => now - c.at < 6000);
    if (busy || now - this.lastAny < CUES.globalCooldownMs || !this.pending.length) return null;
    const ready = this.pending.filter((c) => now - (this.lastByKey.get(c.key) ?? -Infinity) >= this.cooldownFor(c.key));
    if (!ready.length) return null;
    ready.sort((a, b) => P[b.priority] * C[b.confidence] - P[a.priority] * C[a.confidence] || b.at - a.at);
    const pick = ready[0];
    this.pending = this.pending.filter((c) => c !== pick);
    this.lastAny = now;
    this.lastByKey.set(pick.key, now);
    this.countByKey.set(pick.key, (this.countByKey.get(pick.key) ?? 0) + 1);
    return { ...pick, issuedAt: now };
  }
}
