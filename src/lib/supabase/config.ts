// Public Supabase configuration (safe for the browser: the anon key is protected by RLS).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const RECORDINGS_BUCKET = "recordings";
