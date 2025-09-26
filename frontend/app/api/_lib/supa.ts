// frontend/app/api/_lib/supa.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function b64urlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

export function decodeJwt(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(b64urlToUtf8(parts[1]));
  } catch { return null; }
}

export async function getCookieAuthBundle(): Promise<{ access_token?: string, refresh_token?: string } | null> {
  const cs: any = await nextCookies();
  const all = typeof cs?.getAll === 'function' ? cs.getAll() : [];
  const found = all.find((c: any) => c?.name?.startsWith("sb-") && c?.name?.endsWith("-auth-token"));
  if (!found?.value) return null;
  try {
    // Supabase stores a JSON blob here with { access_token, refresh_token }
    const parsed = JSON.parse(found.value);
    if (parsed && typeof parsed === "object") {
      return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
    }
  } catch {}
  return null;
}

/** Resolve user id as best we can.
 * 1) use supabase.auth.getUser()
 * 2) fall back to cookie JSON -> access_token -> decode JWT -> sub
 */
export async function getUserIdViaAny(supabase: any): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) return data.user.id as string;
  } catch {}
  const bundle = await getCookieAuthBundle();
  if (bundle?.access_token) {
    const jwt = decodeJwt(bundle.access_token);
    if (jwt?.sub) return String(jwt.sub);
  }
  return null;
}

export function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false }, global: { headers: { "X-Client-Info": "chatfix-step2b" } } });
}
