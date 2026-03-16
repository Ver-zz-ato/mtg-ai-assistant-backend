import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

/**
 * GET /api/admin/feedback-dashboard
 * Returns counts for the feedback dashboard: feedback table total, ai_response_reports total,
 * and optional breakdown of reports by source (chat vs deck_analyzer_suggestion).
 */
export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const [
      { count: feedbackCount },
      { count: reportsCount },
      { data: reportsSample },
    ] = await Promise.all([
      supabase.from("feedback").select("id", { count: "exact", head: true }),
      supabase
        .from("ai_response_reports")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("ai_response_reports")
        .select("id, context_jsonb")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const sample = reportsSample ?? [];
    const reportBySource: Record<string, number> = {};
    for (const r of sample) {
      const source =
        (r.context_jsonb as { source?: string } | null)?.source ?? "chat";
      reportBySource[source] = (reportBySource[source] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      feedbackTotal: feedbackCount ?? 0,
      aiReportsTotal: reportsCount ?? 0,
      aiReportsBySource: reportBySource,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "server_error" },
      { status: 500 }
    );
  }
}
