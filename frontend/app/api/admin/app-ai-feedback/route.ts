import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

/**
 * GET /api/admin/app-ai-feedback
 *
 * Returns KPIs and rows for structured AI reports that can be identified as
 * mobile-app chat corrections: context_jsonb.source = chat_correction and
 * chat_surface text starts with "app_" (website uses main_chat / deck_chat only).
 */

/** PostgREST JSON text extract + LIKE; must be chained after .select() for typed client. */
function withAppConfirmedRowFilters<T extends { filter: (c: string, o: string, v: string) => T }>(
  q: T,
): T {
  return q
    .filter("context_jsonb->>source", "eq", "chat_correction")
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
        'Rows are limited to ai_response_reports where context_jsonb.source = "chat_correction" and chat_surface starts with "app_" (website corrections use main_chat / deck_chat).',
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
