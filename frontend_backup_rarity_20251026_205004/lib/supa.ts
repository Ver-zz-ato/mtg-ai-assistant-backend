// lib/supa.ts
import { cookies as nextCookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type CookieStore = any;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

// --- Cookie helpers ---------------------------------------------------------
function base64UrlToStr(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 2 ? "==" : b64.length % 4 === 3 ? "=" : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function tryParseJSON(raw: string): any | null {
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(decodeURIComponent(raw)); } catch {}
  try { return JSON.parse(decodeURIComponent(decodeURIComponent(raw))); } catch {}
  // New: Supabase sometimes prefixes "base64-" to the cookie bundle.
  if (raw.startsWith("base64-")) {
    const b64 = raw.slice("base64-".length);
    try { return JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch {}
  }
  return null;
}

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const body = JSON.parse(base64UrlToStr(parts[1]));
    return body?.sub ?? null;
  } catch { return null; }
}

/**
 * Best-effort extraction of userId from the Supabase auth cookie in App Router.
 * Works even when the helper can't resolve a session (e.g. local dev quirks).
 */
export function getUserIdFromCookie(store: CookieStore): string | null {
  const all = typeof store?.getAll === 'function' ? store.getAll() : [];
  const auth = all.find((c: any) => /^sb-.*-auth-token(?:\..+)?$/.test(c.name));
  if (!auth?.value) return null;
  const bundle = tryParseJSON(auth.value);
  // Supabase cookie usually holds: { access_token, refresh_token, user: {...}, expires_at, ... }
  if (bundle?.access_token) {
    const sub = decodeJwtSub(String(bundle.access_token));
    if (sub) return sub;
  }
  if (bundle?.user?.id) return String(bundle.user.id);
  return null;
}

// --- Clients ----------------------------------------------------------------
export function getAdmin() {
  if (!SUPABASE_URL || !SERVICE) throw new Error("Missing SUPABASE_URL or SERVICE key");
  return createAdminClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
}

export function getRouteClient(cookies = nextCookies()) {
  return createRouteHandlerClient({ cookies, supabaseUrl: SUPABASE_URL, supabaseKey: ANON } as any);
}

/**
 * Resolve the current user's id (strong variant). Throws if absent.
 */
export async function getUserIdOrThrow(cookies = nextCookies() as any): Promise<string> {
  // First: official helper
  try {
    const supabase = getRouteClient(cookies);
    const { data } = await (supabase as any).auth.getUser();
    const id = (data as any)?.user?.id;
    if (id) return id;
  } catch {}
  // Fallback: parse auth cookie directly (handles base64- format)
  const fromCookie = getUserIdFromCookie(await (cookies as any));
  if (fromCookie) return fromCookie;
  throw new Error("AUTH_MISSING_USER");
}

/**
 * Resolve the current user's id if available (non-throwing).
 */
export async function getUserIdOptional(cookies = nextCookies() as any): Promise<string | null> {
  try { return await getUserIdOrThrow(cookies as any); } catch { return null; }
}
