import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseEnabled } from "./config";

/** Request-scoped Supabase client acting as the signed-in user (RLS applies). */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseEnabled) return null;
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component render: cookies are read-only there; the proxy refreshes them.
        }
      },
    },
  });
}

/** The verified signed-in user (validated with Supabase Auth), or null. */
export async function getUser(): Promise<User | null> {
  const sb = await getServerSupabase();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser();
  return error ? null : data.user;
}
