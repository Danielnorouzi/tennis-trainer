import { NextResponse, type NextRequest } from "next/server";
import { aiAvailability, env, supabaseConfigured } from "@/lib/server/env";
import { identify } from "@/lib/server/ai-route";
import { usageSnapshot } from "@/lib/server/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the server can do right now. Never returns secrets. */
export async function GET(req: NextRequest) {
  const avail = aiAvailability();
  const e = env();
  const who = await identify(req);
  return NextResponse.json({
    ai: avail.mode,
    realtime: avail.mode === "live" && e.ENABLE_REALTIME,
    supabase: supabaseConfigured(),
    models: avail.mode === "live" ? { analysis: e.OPENAI_ANALYSIS_MODEL, fast: e.OPENAI_FAST_MODEL } : null,
    usage: usageSnapshot(who.key),
    signedIn: who.userId !== null,
  });
}
