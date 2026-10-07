"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseEnabled } from "./config";

let client: SupabaseClient | null = null;

/** Browser Supabase client, or null when Supabase isn't configured (guest-only mode). */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}
