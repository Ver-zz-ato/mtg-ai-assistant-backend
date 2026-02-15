import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

const ALLOWED_CRONS = [
  "deck-costs",
  "commander-aggregates",
  "meta-signals",
  "top-cards",
] as const;

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const cron = String(body?.cron || "").toLowerCase();
    if (!ALLOWED_CRONS.includes(cron as (typeof ALLOWED_CRONS)[number])) {
      return NextResponse.json({
        ok: false,
        error: "invalid_cron",
        allowed: ALLOWED_CRONS,
      }, { status: 400 });
    }

    const cronKey =
      process.env.CRON_KEY ||
      process.env.CRON_SECRET ||
      process.env.RENDER_CRON_SECRET ||
      "";
    if (!cronKey) {
      return NextResponse.json({ ok: false, error: "CRON_KEY not configured" }, { status: 500 });
    }

    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      (req.headers.get("x-forwarded-proto") && req.headers.get("x-forwarded-host")
        ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("x-forwarded-host")}`
        : req.nextUrl.origin || "http://localhost:3000");
    const url = `${base}/api/cron/${cron}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "x-cron-key": cronKey },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data?.error || res.statusText }, { status: res.status });
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
