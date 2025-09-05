import { NextResponse } from "next/server";
import { cookies as cookieStore } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function readAccessTokenFromCookie(): { token: string | null; rawPreview: string } {
  const jar = cookieStore();
  const authCookie = jar.getAll().find((c) => c.name.endsWith("-auth-token"));
  if (!authCookie?.value) return { token: null, rawPreview: "" };

  let raw = authCookie.value;
  let preview = raw.slice(0, 24);
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
  const { token, rawPreview } = readAccessTokenFromCookie();
  const cookieNames = cookieStore().getAll().map((c) => c.name);

  const supabase = createClient();

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
    cookie_names: cookieNames,
  });
}
