import "server-only";

// Request guards shared by the AI routes: per-user rate limiting, daily cost budgets, a
// concurrency limit, and a small response cache for de-duplicating identical requests.
//
// State is in-process memory. That is correct for a single Node server (local / one container).
// For multi-instance deployments, usage is ALSO written to the Supabase `ai_usage` table when a
// service-role key is configured, and budgets are checked against it (see usage.ts).

interface Bucket {
  times: number[];
}

const buckets = new Map<string, Bucket>();

/** Sliding-window rate limit. Returns seconds to wait, or 0 if allowed. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): number {
  const b = buckets.get(key) ?? { times: [] };
  b.times = b.times.filter((t) => now - t < windowMs);
  if (b.times.length >= limit) {
    buckets.set(key, b);
    return Math.ceil((windowMs - (now - b.times[0])) / 1000);
  }
  b.times.push(now);
  buckets.set(key, b);
  return 0;
}

export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private max: number) {}

  get inFlight(): number {
    return this.active;
  }

  async acquire(signal?: AbortSignal, maxWaitMs = 30_000): Promise<() => void> {
    if (this.active < this.max) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((q) => q !== go);
        reject(new GuardError(503, "busy", "The coach is busy right now. Please try again shortly."));
      }, maxWaitMs);
      const go = () => {
        clearTimeout(timer);
        this.active += 1;
        resolve(() => this.release());
      };
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        this.queue = this.queue.filter((q) => q !== go);
        reject(new GuardError(499, "cancelled", "Request cancelled."));
      });
      this.queue.push(go);
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

export class GuardError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

/** Tiny LRU cache keyed by request hash. */
export class LruCache<V> {
  private map = new Map<string, { v: V; at: number }>();
  constructor(
    private max = 100,
    private ttlMs = 6 * 3600_000,
  ) {}

  get(k: string): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() - e.at > this.ttlMs) {
      this.map.delete(k);
      return undefined;
    }
    this.map.delete(k);
    this.map.set(k, e);
    return e.v;
  }

  set(k: string, v: V): void {
    this.map.delete(k);
    this.map.set(k, { v, at: Date.now() });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reset in-memory state (tests only). */
export function __resetGuardsForTests(): void {
  buckets.clear();
}
