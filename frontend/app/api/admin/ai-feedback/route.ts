import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import {
  aggregateAiFeedbackGroups,
  parseTimeWindowPreset,
  queryAiFeedbackEvents,
} from "@/lib/admin/ai-feedback-query";

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
    const preset = url.searchParams.get("window") || url.searchParams.get("preset");
    const { since: presetSince, until: presetUntil } = parseTimeWindowPreset(preset);
    const since = url.searchParams.get("since") || presetSince;
    const until = url.searchParams.get("until") || presetUntil;
    const client = url.searchParams.get("client");
    const feature = url.searchParams.get("feature");
    const route = url.searchParams.get("route");
    const surfaceKind = url.searchParams.get("surfaceKind");
    const ratingParam = url.searchParams.get("rating");
    const status = url.searchParams.get("status") || "all";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10));
    const includeGroups = url.searchParams.get("groups") === "1";

    const rating =
      ratingParam != null && ratingParam !== "" ? parseInt(ratingParam, 10) : null;

    const list = await queryAiFeedbackEvents({
      since,
      until,
      client,
      feature,
      route,
      surfaceKind,
      rating: Number.isNaN(rating as number) ? null : rating,
      status: status === "all" ? null : status,
      limit,
      offset,
    });

    if (!list.ok) {
      return NextResponse.json({ ok: false, error: list.error }, { status: list.error === "missing_service_role" ? 503 : 400 });
    }

    let groups = null;
    if (includeGroups) {
      const agg = await aggregateAiFeedbackGroups({ since, until, client });
      if (agg.ok) {
        groups = { byFeature: agg.byFeature, byRoute: agg.byRoute };
      }
    }

    return NextResponse.json({
      ok: true,
      events: list.rows,
      total: list.total,
      limit: list.limit,
      offset: list.offset,
      groups,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
