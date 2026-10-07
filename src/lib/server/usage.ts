import "server-only";

// AI cost accounting and daily budgets. Always kept in memory; additionally persisted to the
// Supabase `ai_usage` table (and checked against it) when a service-role key is configured.

import { env, price } from "./env";
import { GuardError } from "./guards";
import { getAdminSupabase } from "../supabase/admin";

export type AiKind = "report" | "compare" | "chat" | "plan" | "realtime";

interface DayLedger {
  day: string;
  perUser: Map<string, number>;
  global: number;
}

let ledger: DayLedger = { day: today(), perUser: new Map(), global: 0 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function current(): DayLedger {
  const d = today();
  if (ledger.day !== d) ledger = { day: d, perUser: new Map(), global: 0 };
  return ledger;
}

export function estimateCostUsd(kind: "analysis" | "fast", inputTokens: number, outputTokens: number): number {
  const p = price(kind);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

async function persistedSpendToday(userId: string): Promise<number | null> {
  const admin = getAdminSupabase();
  if (!admin) return null;
  const since = `${today()}T00:00:00.000Z`;
  const { data, error } = await admin.from("ai_usage").select("cost_usd").eq("user_id", userId).gte("created_at", since);
  if (error || !data) return null;
  return data.reduce((s, r: { cost_usd: number | string }) => s + Number(r.cost_usd), 0);
}

/** Throws a 429 GuardError when the user's or the global daily budget is exhausted. */
export async function checkBudget(requesterKey: string, userId: string | null): Promise<void> {
  const e = env();
  const L = current();
  if (L.global >= e.AI_DAILY_BUDGET_USD_GLOBAL) {
    throw new GuardError(429, "budget_global", "Today's AI coaching budget for this app has been reached. On-device analysis still works.");
  }
  let spent = L.perUser.get(requesterKey) ?? 0;
  if (userId) {
    const persisted = await persistedSpendToday(userId);
    if (persisted !== null) spent = Math.max(spent, persisted);
  }
  if (spent >= e.AI_DAILY_BUDGET_USD_PER_USER) {
    throw new GuardError(429, "budget_user", "You've reached today's AI coaching limit. On-device analysis still works, and the limit resets tomorrow.");
  }
}

export async function recordUsage(opts: {
  requesterKey: string;
  userId: string | null;
  model: string;
  kind: AiKind;
  inputTokens: number;
  outputTokens: number;
  priceTier: "analysis" | "fast";
}): Promise<number> {
  const cost = estimateCostUsd(opts.priceTier, opts.inputTokens, opts.outputTokens);
  const L = current();
  L.global += cost;
  L.perUser.set(opts.requesterKey, (L.perUser.get(opts.requesterKey) ?? 0) + cost);
  const admin = getAdminSupabase();
  if (admin && opts.userId) {
    const { error } = await admin.from("ai_usage").insert({
      user_id: opts.userId,
      model: opts.model,
      analysis_type: opts.kind,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      cost_usd: cost,
    });
    if (error) console.warn("[usage] could not persist ai_usage row:", error.code);
  }
  return cost;
}

export function usageSnapshot(requesterKey: string) {
  const L = current();
  const e = env();
  return {
    day: L.day,
    spentUsd: +(L.perUser.get(requesterKey) ?? 0).toFixed(4),
    budgetUsd: e.AI_DAILY_BUDGET_USD_PER_USER,
  };
}
