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

/** Related rows for session_id OR correlation_id (admin forensic). */
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
    const sessionId = searchParams.get("session_id") || "";
    const correlationId = searchParams.get("correlation_id") || "";
    if (!sessionId && !correlationId) {
      return NextResponse.json({ ok: false, error: "session_or_correlation_required" }, { status: 400 });
    }

    const windowKey = searchParams.get("window") || "24h";
    const minutes = WINDOW_MIN[windowKey] ?? WINDOW_MIN["24h"];
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    let q = admin
      .from("observability_cost_events")
      .select("*")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(200);

    const esc = (s: string) => s.replace(/%/g, "\\%").replace(/,/g, "\\,");
    if (sessionId && correlationId) {
      q = q.or(
        `session_id.ilike.%${esc(sessionId)}%,correlation_id.ilike.%${esc(correlationId)}%`,
      );
    } else if (sessionId) {
      q = q.ilike("session_id", `%${sessionId}%`);
    } else {
      q = q.ilike("correlation_id", `%${correlationId}%`);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      window: windowKey,
      rows: data ?? [],
    });
  } catch (e) {
    console.warn("[CostAudit] related GET failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
