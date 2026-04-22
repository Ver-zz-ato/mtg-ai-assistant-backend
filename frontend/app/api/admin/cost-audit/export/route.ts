import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

const WINDOW_MIN: Record<string, number> = {
  "15m": 15,
  "1h": 60,
  "6h": 360,
  "24h": 1440,
  "7d": 10080,
};

const EXPORT_MAX = 25_000;

/** Admin-only: export filtered cost-audit rows as JSON (for spreadsheets / offline analysis). */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const windowKey = searchParams.get("window") || "24h";
    const minutes = WINDOW_MIN[windowKey] ?? WINDOW_MIN["24h"];
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const routeFilter = searchParams.get("route") || "";
    const eventFilter = searchParams.get("event_name") || "";
    const sourceFilter = searchParams.get("source") || "";
    const requestIdSearch = searchParams.get("request_id") || "";
    const userIdSearch = searchParams.get("user_id") || "";
    const componentFilter = searchParams.get("component") || "";
    const sessionIdFilter = searchParams.get("session_id") || "";
    const correlationFilter = searchParams.get("correlation_id") || "";

    const applyFilters = (q: any) => {
      let x = q;
      if (routeFilter) x = x.eq("route", routeFilter);
      if (eventFilter) x = x.eq("event_name", eventFilter);
      if (sourceFilter) x = x.eq("source", sourceFilter);
      if (requestIdSearch) x = x.ilike("request_id", `%${requestIdSearch}%`);
      if (userIdSearch) x = x.ilike("user_id", `%${userIdSearch}%`);
      if (componentFilter) x = x.ilike("component", `%${componentFilter}%`);
      if (sessionIdFilter) x = x.ilike("session_id", `%${sessionIdFilter}%`);
      if (correlationFilter) x = x.ilike("correlation_id", `%${correlationFilter}%`);
      return x;
    };

    const { data, error } = await applyFilters(
      admin
        .from("observability_cost_events")
        .select("*")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(EXPORT_MAX),
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const body = JSON.stringify(
      {
        ok: true,
        exportedAt: new Date().toISOString(),
        window: windowKey,
        from: fromIso,
        to: toIso,
        rowCount: rows.length,
        capped: rows.length >= EXPORT_MAX,
        rows,
      },
      null,
      2,
    );

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="cost-audit-export-${windowKey}.json"`,
      },
    });
  } catch (e) {
    console.warn("[CostAudit] export failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
