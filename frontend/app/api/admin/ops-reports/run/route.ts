import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.type === "daily" ? "daily" : "weekly";

    const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
    const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const baseUrl = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

    const cronSecret = process.env.CRON_SECRET || process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    if (!cronSecret) {
      return NextResponse.json({ ok: false, error: "CRON_SECRET not configured" }, { status: 500 });
    }

    const url = `${baseUrl.replace(/\/$/, "")}/api/cron/ops-report?type=${type}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-cron-key": cronSecret,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: data?.error || `HTTP ${res.status}` }, { status: res.status });
    }

    return NextResponse.json({ ok: true, ...data });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
