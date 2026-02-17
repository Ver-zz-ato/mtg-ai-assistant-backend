/**
 * Server-side admin gating.
 * Uses ADMIN_USER_IDS and ADMIN_EMAILS env vars.
 */

import { getServerSupabase } from "@/lib/server-supabase";

export function isAdmin(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user.id || "");
  const email = String(user.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * Get current user and verify admin. For API routes.
 * Returns { user, ok: true } if admin, or { user: null, ok: false, response } for 404.
 */
export async function requireAdminForApi(): Promise<
  | { user: { id: string; email?: string }; ok: true }
  | { user: null; ok: false; response: Response }
> {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return {
      user: null,
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { user: { id: user.id, email: user.email }, ok: true };
}
