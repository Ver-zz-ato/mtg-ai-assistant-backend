import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { submitToIndexNow } from "@/lib/seo/indexnow";

export const runtime = "nodejs";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const token =
    req.headers.get("x-admin-token") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-cron-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected =
    process.env.ADMIN_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.CRON_KEY ||
    process.env.RENDER_CRON_SECRET ||
    "";
  if (expected && token && token === expected) return true;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!(user && isAdmin(user));
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAuthorized(req))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const urls = body?.urls;
    if (!(typeof urls === "string" || Array.isArray(urls))) {
      return NextResponse.json({ ok: false, error: "urls must be a string or string array" }, { status: 400 });
    }

    const result = await submitToIndexNow(urls);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[indexnow] admin submit failed", message);
    return NextResponse.json({ ok: false, error: "indexnow_submit_failed", message }, { status: 500 });
  }
}
