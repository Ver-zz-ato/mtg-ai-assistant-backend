import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "10", 10)));
    const type = req.nextUrl.searchParams.get("type") || undefined;

    let q = admin
      .from("ops_reports")
      .select("id, created_at, report_type, status, summary, details, duration_ms, error")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type === "daily" || type === "weekly") {
      q = q.eq("report_type", type === "daily" ? "daily_ops" : "weekly_ops");
    }

    const { data: rows, error } = await q;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const list = rows || [];
    let latestDaily = list.find((r: { report_type: string }) => r.report_type === "daily_ops") ?? null;
    let latestWeekly = list.find((r: { report_type: string }) => r.report_type === "weekly_ops") ?? null;

    if (!latestDaily && !type) {
      const { data: dRows } = await admin.from("ops_reports").select("id, created_at, report_type, status, summary, details, duration_ms, error").eq("report_type", "daily_ops").order("created_at", { ascending: false }).limit(1);
      latestDaily = (dRows as any[])?.[0] ?? null;
    }
    if (!latestWeekly && !type) {
      const { data: wRows } = await admin.from("ops_reports").select("id, created_at, report_type, status, summary, details, duration_ms, error").eq("report_type", "weekly_ops").order("created_at", { ascending: false }).limit(1);
      latestWeekly = (wRows as any[])?.[0] ?? null;
    }

    return NextResponse.json({
      ok: true,
      reports: list,
      latest_daily: latestDaily,
      latest_weekly: latestWeekly,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
