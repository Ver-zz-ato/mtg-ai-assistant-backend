import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

/**
 * GET /api/admin/app-ai-feedback
 *
 * KPIs + rows for app-identified structured reports: context_jsonb.source is
 * chat_correction or app_chat_issue, and chat_surface starts with app_.
 */
function withAppConfirmedRowFilters<T extends { or: (filters: string) => T; filter: (c: string, o: string, v: string) => T }>(
  q: T,
): T {
  return q
    .or("context_jsonb->>source.eq.chat_correction,context_jsonb->>source.eq.app_chat_issue")
    .filter("context_jsonb->>chat_surface", "like", "app\\_%");
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "all";
    const issueType = url.searchParams.get("issueType")?.trim() || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));

    const [
      { count: confirmedTotal },
      { count: pendingCount },
      { count: reviewedCount },
      { count: resolvedCount },
      { count: dismissedCount },
      { data: latestRow },
    ] = await Promise.all([
      withAppConfirmedRowFilters(
        supabase.from("ai_response_reports").select("id", { count: "exact", head: true }),
      ),
      withAppConfirmedRowFilters(
        supabase
          .from("ai_response_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ),
      withAppConfirmedRowFilters(
        supabase
          .from("ai_response_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "reviewed"),
      ),
      withAppConfirmedRowFilters(
        supabase
          .from("ai_response_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "resolved"),
      ),
      withAppConfirmedRowFilters(
        supabase
          .from("ai_response_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "dismissed"),
      ),
      withAppConfirmedRowFilters(supabase.from("ai_response_reports").select("created_at"))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    let listQuery = withAppConfirmedRowFilters(
      supabase
        .from("ai_response_reports")
        .select(
          "id, created_at, status, issue_types, description, thread_id, message_id, user_id, context_jsonb, admin_notes",
          { count: "exact" },
        ),
    )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      listQuery = listQuery.eq("status", status);
    }
    if (issueType) {
      listQuery = listQuery.contains("issue_types", [issueType]);
    }

    const { data: rows, error: listError, count: listTotal } = await listQuery;

    if (listError) {
      return NextResponse.json(
        { ok: false, error: listError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      filterExplanation:
        'Rows: (source = chat_correction OR app_chat_issue) AND chat_surface LIKE app_%. Mobile Report uses app_chat_issue.',
      summary: {
        confirmedAppStructuredReports: confirmedTotal ?? 0,
        byStatus: {
          pending: pendingCount ?? 0,
          reviewed: reviewedCount ?? 0,
          resolved: resolvedCount ?? 0,
          dismissed: dismissedCount ?? 0,
        },
        latestConfirmedAt: latestRow?.created_at ?? null,
      },
      reports: rows ?? [],
      totalMatchingFilters: listTotal ?? 0,
      limit,
      offset,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
