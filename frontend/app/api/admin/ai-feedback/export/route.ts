import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import {
  buildCursorExportPayload,
  getAiFeedbackEventById,
  parseTimeWindowPreset,
  queryAiFeedbackEvents,
} from "@/lib/admin/ai-feedback-query";
import { getAppFeaturePageLabel } from "@/lib/ai/app-feature-labels";

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
    const mode = url.searchParams.get("mode") || "all";
    const id = url.searchParams.get("id");
    const feature = url.searchParams.get("feature");
    const route = url.searchParams.get("route");
    const preset = url.searchParams.get("window") || url.searchParams.get("preset");
    const { since, until } = parseTimeWindowPreset(preset);
    const client = url.searchParams.get("client");

    const filterMeta = {
      mode,
      since,
      until,
      client,
      feature,
      route,
      id,
    };

    if (mode === "item") {
      if (!id) {
        return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
      }
      const one = await getAiFeedbackEventById(id);
      if (!one.ok) {
        return NextResponse.json({ ok: false, error: one.error }, { status: one.error === "not_found" ? 404 : 400 });
      }
      const row = one.row;
      const payload = buildCursorExportPayload(
        [
          {
            id: row.id,
            createdAt: row.created_at,
            client: row.client,
            feature: row.feature,
            featureLabel: getAppFeaturePageLabel(row.feature),
            route: row.route,
            surfaceKind: row.surface_kind,
            rating: row.rating,
            comment: row.comment,
            issueTypes: row.issue_types,
            userInputText: row.user_input_text,
            aiOutputText: row.ai_output_text,
            context: row.context_jsonb,
            status: row.status,
          },
        ],
        filterMeta,
      );
      return NextResponse.json({ ok: true, export: payload });
    }

    const list = await queryAiFeedbackEvents({
      since,
      until,
      client,
      feature: mode === "group" ? feature : feature || undefined,
      route: mode === "group" ? route : route || undefined,
      limit: mode === "all" ? 500 : 200,
      offset: 0,
    });

    if (!list.ok) {
      return NextResponse.json({ ok: false, error: list.error }, { status: 503 });
    }

    const items = list.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      client: row.client,
      feature: row.feature,
      featureLabel: getAppFeaturePageLabel(row.feature),
      route: row.route,
      surfaceKind: row.surface_kind,
      rating: row.rating,
      comment: row.comment,
      issueTypes: row.issue_types,
      userInputText: row.user_input_text,
      aiOutputText: row.ai_output_text,
      context: row.context_jsonb,
      status: row.status,
    }));

    const payload = buildCursorExportPayload(items, {
      ...filterMeta,
      totalAvailable: list.total,
      truncated: list.total > items.length,
    });

    return NextResponse.json({ ok: true, export: payload });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
