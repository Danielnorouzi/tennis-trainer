import "server-only";

// Shared pipeline for every AI route:
//   size limit → JSON → Zod validation → availability → identity → rate limit → cache →
//   budget → concurrency slot → model call (or labelled fixture) → post-validation → usage log.
// Errors are mapped to safe, user-presentable messages; secrets and raw upstream errors are never
// returned to the browser.

import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { aiAvailability, env } from "./env";
import { GuardError, LruCache, Semaphore, rateLimit, sha256 } from "./guards";
import { isOpenAIError } from "./openai";
import { checkBudget, recordUsage, type AiKind } from "./usage";
import { getUser } from "../supabase/server";

export interface AiResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiRouteSpec<S extends z.ZodType, T> {
  kind: AiKind;
  schema: S;
  maxBytes: number;
  priceTier: "analysis" | "fast";
  /** whether identical requests may be served from cache */
  cacheable: boolean;
  live: (body: z.infer<S>, ctx: { signal: AbortSignal; userKey: string }) => Promise<AiResult<T>>;
  fixture: (body: z.infer<S>) => T;
}

const cache = new LruCache<{ data: unknown; model: string; mode: "live" | "fixture" }>(200);
let semaphore: Semaphore | null = null;

export interface Requester {
  key: string;
  userId: string | null;
}

export async function identify(req: NextRequest): Promise<Requester> {
  const user = await getUser().catch(() => null);
  if (user) return { key: `u:${user.id}`, userId: user.id };
  // Guests: random id generated in the browser plus the client IP. Only used for rate limiting
  // and budgets — guests never get server-side storage.
  const guest = (req.headers.get("x-rally-guest") ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "anon";
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  return { key: `g:${guest}:${ip}`, userId: null };
}

export function errorResponse(status: number, code: string, message: string, retryAfterSec?: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined },
  );
}

export async function handleAiRoute<S extends z.ZodType, T>(req: NextRequest, spec: AiRouteSpec<S, T>): Promise<NextResponse> {
  try {
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len > spec.maxBytes) return errorResponse(413, "too_large", "Request is too large.");
    const text = await req.text();
    if (text.length > spec.maxBytes) return errorResponse(413, "too_large", "Request is too large.");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return errorResponse(400, "invalid_json", "Request body must be JSON.");
    }
    const parsed = spec.schema.safeParse(json);
    if (!parsed.success) {
      const where = parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") || "(root)").join(", ");
      return errorResponse(400, "invalid_request", `Invalid request fields: ${where}`);
    }
    const body = parsed.data as z.infer<S>;

    const avail = aiAvailability();
    if (avail.mode === "unavailable") {
      return errorResponse(503, "ai_unavailable", "AI coaching is unavailable right now. Your on-device analysis is still available.");
    }

    const who = await identify(req);
    const e = env();
    const wait = rateLimit(`${spec.kind}:${who.key}`, spec.kind === "chat" ? e.AI_REQUESTS_PER_10_MIN * 2 : e.AI_REQUESTS_PER_10_MIN, 10 * 60_000);
    if (wait > 0) return errorResponse(429, "rate_limited", `Too many requests. Try again in ${wait} s.`, wait);

    const cacheKey = spec.cacheable ? await sha256(`${spec.kind}:${avail.mode}:${text}`) : null;
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit) return NextResponse.json({ data: hit.data, meta: { model: hit.model, mode: hit.mode, cached: true } });
    }

    if (avail.mode === "fixture") {
      const data = spec.fixture(body);
      if (cacheKey) cache.set(cacheKey, { data, model: "fixture", mode: "fixture" });
      return NextResponse.json({ data, meta: { model: "fixture", mode: "fixture", cached: false } });
    }

    await checkBudget(who.key, who.userId);
    semaphore ??= new Semaphore(Math.max(1, e.AI_MAX_CONCURRENT));
    const release = await semaphore.acquire(req.signal);
    try {
      const result = await spec.live(body, { signal: req.signal, userKey: who.key });
      const cost = await recordUsage({
        requesterKey: who.key,
        userId: who.userId,
        model: result.model,
        kind: spec.kind,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        priceTier: spec.priceTier,
      });
      if (cacheKey) cache.set(cacheKey, { data: result.data, model: result.model, mode: "live" });
      return NextResponse.json({
        data: result.data,
        meta: { model: result.model, mode: "live", cached: false, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, estCostUsd: +cost.toFixed(5) } },
      });
    } finally {
      release();
    }
  } catch (err) {
    return mapError(err);
  }
}

export function mapError(err: unknown): NextResponse {
  if (err instanceof GuardError) return errorResponse(err.status, err.code, err.message, err.retryAfterSec);
  if (isOpenAIError(err)) {
    const status = err.status ?? 502;
    console.warn(`[ai] upstream error status=${status} type=${err.name}`);
    if (status === 429) return errorResponse(503, "ai_busy", "The AI service is busy. Please try again in a minute.", 60);
    if (status === 401 || status === 403) return errorResponse(503, "ai_unavailable", "AI coaching is not configured correctly on this server.");
    if (status === 400) return errorResponse(502, "ai_rejected", "The AI service could not process this request.");
    return errorResponse(502, "ai_error", "The AI service had a problem. Please try again.");
  }
  if (err instanceof Error && (err.name === "AbortError" || err.name === "APIUserAbortError")) {
    return errorResponse(499, "cancelled", "Request cancelled.");
  }
  if (err instanceof Error && /timed? ?out/i.test(err.message)) {
    return errorResponse(504, "timeout", "The analysis took too long. Please try again.");
  }
  console.error("[ai] unexpected error", err instanceof Error ? err.name : typeof err);
  return errorResponse(500, "internal", "Something went wrong on our side.");
}
