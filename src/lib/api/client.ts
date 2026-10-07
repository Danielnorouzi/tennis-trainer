"use client";

// Browser → server API helper: guest identifier header, timeouts, cancellation, and retries with
// exponential back-off for transient failures (network errors, 502/503/504).

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const GUEST_KEY = "rally.guestId";

export function guestId(): string {
  try {
    let id = localStorage.getItem(GUEST_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

export interface AiMeta {
  model: string;
  mode: "live" | "fixture";
  cached: boolean;
  usage?: { inputTokens: number; outputTokens: number; estCostUsd: number };
}

const TRANSIENT = new Set([502, 503, 504]);

export async function postJson<T>(
  path: string,
  body: unknown,
  opts: { signal?: AbortSignal; retries?: number; timeoutMs?: number } = {},
): Promise<{ data: T; meta: AiMeta }> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rally-guest": guestId() },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as { data?: T; meta?: AiMeta; error?: { code: string; message: string } };
      if (res.ok && json.data !== undefined) return { data: json.data, meta: json.meta as AiMeta };
      const err = new ApiError(res.status, json.error?.code ?? "http_error", json.error?.message ?? `Request failed (${res.status})`);
      // "ai_unavailable" is a configuration state, not a transient failure.
      if (!TRANSIENT.has(res.status) || err.code === "ai_unavailable" || err.code === "realtime_unavailable") throw err;
      lastErr = err;
    } catch (e) {
      if (opts.signal?.aborted) throw new ApiError(499, "cancelled", "Cancelled.");
      if (e instanceof ApiError && (!TRANSIENT.has(e.status) || e.code === "ai_unavailable")) throw e;
      lastErr = e instanceof ApiError ? e : new ApiError(0, "network", "Network problem — check your connection.");
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
  }
  throw lastErr;
}

export interface ServerStatus {
  ai: "live" | "fixture" | "unavailable";
  realtime: boolean;
  supabase: boolean;
  models: { analysis: string; fast: string } | null;
  usage: { day: string; spentUsd: number; budgetUsd: number };
  signedIn: boolean;
}

export async function getServerStatus(): Promise<ServerStatus | null> {
  try {
    const res = await fetch("/api/ai/status", { headers: { "x-rally-guest": guestId() }, cache: "no-store" });
    return res.ok ? ((await res.json()) as ServerStatus) : null;
  } catch {
    return null;
  }
}
