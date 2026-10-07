import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/ai-route";
import { getUser } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { RECORDINGS_BUCKET } from "@/lib/supabase/config";

export const runtime = "nodejs";

/**
 * Permanently deletes the signed-in user's cloud data: their private recordings and their auth
 * user (all table rows cascade from auth.users via foreign keys). Guest data lives only in the
 * browser and is cleared client-side.
 */
export async function POST() {
  const user = await getUser();
  if (!user) return errorResponse(401, "unauthorized", "Sign in to delete your account.");
  const admin = getAdminSupabase();
  if (!admin) return errorResponse(503, "not_configured", "Account deletion requires SUPABASE_SERVICE_ROLE_KEY on the server.");

  // Remove stored media first (storage objects don't cascade).
  for (let page = 0; page < 50; page++) {
    const { data, error } = await admin.storage.from(RECORDINGS_BUCKET).list(user.id, { limit: 100 });
    if (error || !data?.length) break;
    await admin.storage.from(RECORDINGS_BUCKET).remove(data.map((f) => `${user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return errorResponse(500, "delete_failed", "Could not delete the account. Please try again.");
  return NextResponse.json({ ok: true });
}
