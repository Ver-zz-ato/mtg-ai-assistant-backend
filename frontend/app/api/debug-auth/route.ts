import { NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getAllCookies(): Array<{ name: string; value: string }> {
  try {
    const jar: any = (cookieStore as any)(); // handles Promise/Non-Promise
    return typeof jar?.getAll === "function" ? jar.getAll() : [];
  } catch {
    return [];
  }
}

function readAccessTokenFromCookie(): { token: string | null; rawPreview: string } {
  const all = getAllCookies();
  const authCookie = all.find((c) => String(c?.name).endsWith("-auth-token"));
  if (!authCookie?.value) return { token: null, rawPreview: "" };

  let raw = String(authCookie.value);
  const preview = raw.slice(0, 24);
  try {
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
    }
    const parsed = JSON.parse(raw);
    return { token: parsed?.access_token ?? null, rawPreview: preview };
  } catch {
    return { token: null, rawPreview: preview };
  }
}

export async function GET() {
  const supabase = createClient();
  const all = getAllCookies();
  const cookie_names = all.map((c) => c.name);

  const { token, rawPreview } = readAccessTokenFromCookie();

  let user = null as any;
  let error: string | null = null;

  if (token) {
    const { data, error: e } = await supabase.auth.getUser(token);
    user = data?.user ?? null;
    error = e?.message ?? null;
  }

  return NextResponse.json({
    ok: true,
    token_present: Boolean(token),
    token_preview: rawPreview,
    user,
    error,
    cookie_names,
  });
}
