import "server-only";
import { z } from "zod";

// Server-side configuration, validated once. Secrets never leave this module's consumers
// (route handlers). Nothing here is imported by client components.

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const num = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().finite().nonnegative());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OPENAI_API_KEY: z.string().optional(),
  /** model for detailed reports, comparisons and plans */
  OPENAI_ANALYSIS_MODEL: z.string().default("gpt-6.1-sol"),
  /** cheaper model for chat */
  OPENAI_FAST_MODEL: z.string().default("gpt-6-luna"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2.1"),
  OPENAI_REALTIME_VOICE: z.string().default("marin"),
  ENABLE_REALTIME: bool(false),
  /** "live" (default) or "fixture" — fixture returns deterministic labelled test data, never in production */
  AI_MODE: z.enum(["live", "fixture"]).default("live"),
  AI_TIMEOUT_MS: num(60_000),
  AI_MAX_RETRIES: num(2),
  AI_DAILY_BUDGET_USD_PER_USER: num(0.5),
  AI_DAILY_BUDGET_USD_GLOBAL: num(10),
  AI_MAX_CONCURRENT: num(4),
  AI_REQUESTS_PER_10_MIN: num(12),
  AI_IMAGE_DETAIL: z.enum(["low", "high", "auto"]).default("low"),
  /** USD per 1M tokens, used for cost estimates: "input,output" */
  AI_PRICE_ANALYSIS: z.string().default("2,10"),
  AI_PRICE_FAST: z.string().default("0.1,0.5"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Log which variables are wrong — never their values.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment configuration: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset cached env (tests only). */
export function __resetEnvForTests(): void {
  cached = null;
}

export type AiAvailability = { mode: "live" } | { mode: "fixture" } | { mode: "unavailable"; reason: string };

/**
 * Live when a key is configured. Fixture mode only when explicitly requested and NOT in production,
 * so a misconfigured production deploy can never silently serve fake coaching.
 */
export function aiAvailability(): AiAvailability {
  const e = env();
  if (e.AI_MODE === "fixture") {
    if (e.NODE_ENV === "production") return { mode: "unavailable", reason: "Fixture mode is disabled in production." };
    return { mode: "fixture" };
  }
  if (!e.OPENAI_API_KEY) return { mode: "unavailable", reason: "OPENAI_API_KEY is not configured." };
  return { mode: "live" };
}

export function supabaseConfigured(): boolean {
  const e = env();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function price(kind: "analysis" | "fast"): { input: number; output: number } {
  const raw = kind === "analysis" ? env().AI_PRICE_ANALYSIS : env().AI_PRICE_FAST;
  const [i, o] = raw.split(",").map(Number);
  return { input: Number.isFinite(i) ? i : 0, output: Number.isFinite(o) ? o : 0 };
}
