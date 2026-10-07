import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { z } from "zod";
import { env } from "./env";
import { GuardError, sha256 } from "./guards";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const e = env();
  if (!e.OPENAI_API_KEY) throw new GuardError(503, "ai_unavailable", "AI coaching is not configured on this server.");
  client ??= new OpenAI({ apiKey: e.OPENAI_API_KEY, maxRetries: e.AI_MAX_RETRIES, timeout: e.AI_TIMEOUT_MS });
  return client;
}

export interface StructuredResult<T> {
  data: T;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * One structured call to the Responses API. The schema constrains the model (Structured Outputs)
 * and the parsed result is re-validated with the same Zod schema before it is returned.
 */
export async function runStructured<S extends z.ZodType>(opts: {
  model: string;
  instructions: string;
  content: ResponseInputContent[];
  schema: S;
  schemaName: string;
  signal?: AbortSignal;
  /** stable per-user identifier (hashed) for OpenAI abuse monitoring */
  userKey?: string;
  maxOutputTokens?: number;
}): Promise<StructuredResult<z.infer<S>>> {
  const openai = getClient();
  const response = await openai.responses.parse(
    {
      model: opts.model,
      instructions: opts.instructions,
      input: [{ role: "user", content: opts.content }],
      text: { format: zodTextFormat(opts.schema, opts.schemaName) },
      max_output_tokens: opts.maxOutputTokens ?? 4000,
      store: false,
      ...(opts.userKey ? { safety_identifier: (await sha256(opts.userKey)).slice(0, 32) } : {}),
    },
    { signal: opts.signal },
  );

  const parsed = opts.schema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new GuardError(502, "malformed_ai_response", "The AI coach returned an unexpected response. Please try again.");
  }
  return {
    data: parsed.data,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    model: response.model ?? opts.model,
  };
}

/** Mint a short-lived client secret for an OpenAI Realtime WebRTC session. */
export async function createRealtimeSecret(opts: { instructions: string; userKey: string }): Promise<{ value: string; expiresAt: number | null; model: string }> {
  const e = env();
  if (!e.OPENAI_API_KEY) throw new GuardError(503, "ai_unavailable", "Voice coaching is not configured on this server.");
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": (await sha256(opts.userKey)).slice(0, 32),
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: e.OPENAI_REALTIME_MODEL,
        instructions: opts.instructions,
        audio: { output: { voice: e.OPENAI_REALTIME_VOICE } },
      },
    }),
  });
  if (!res.ok) {
    throw new GuardError(502, "realtime_failed", `Could not start a voice session (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { value?: string; expires_at?: number };
  if (!data.value) throw new GuardError(502, "realtime_failed", "Voice session response was missing a client secret.");
  return { value: data.value, expiresAt: data.expires_at ?? null, model: e.OPENAI_REALTIME_MODEL };
}

export function isOpenAIError(e: unknown): e is InstanceType<typeof OpenAI.APIError> {
  return e instanceof OpenAI.APIError;
}

export { OpenAI };
