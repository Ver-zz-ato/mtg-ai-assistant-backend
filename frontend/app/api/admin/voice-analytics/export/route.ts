import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getVoiceAnalyticsById, parseTimeWindowPreset, queryVoiceAnalytics } from "@/lib/admin/voice-analytics-query";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "all";
    if (mode === "item") {
      const id = url.searchParams.get("id");
      if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
      const result = await getVoiceAnalyticsById(id);
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
      }
      return NextResponse.json({ ok: true, export: { mode, item: result.row } });
    }

    const preset = url.searchParams.get("window") || url.searchParams.get("preset");
    const { since: presetSince, until: presetUntil } = parseTimeWindowPreset(preset);
    const result = await queryVoiceAnalytics({
      since: url.searchParams.get("since") || presetSince,
      until: url.searchParams.get("until") || presetUntil,
      tier: url.searchParams.get("tier"),
      mode: url.searchParams.get("modeFilter"),
      outcome: url.searchParams.get("outcome"),
      screen: url.searchParams.get("screen"),
      matchQuality: url.searchParams.get("matchQuality"),
      clarifyReason: url.searchParams.get("clarifyReason"),
      limit: Math.min(parseInt(url.searchParams.get("limit") || "500", 10), 1000),
      offset: 0,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      export: {
        mode: "all",
        total: result.total,
        generatedAt: new Date().toISOString(),
        filters: Object.fromEntries(url.searchParams.entries()),
        items: result.rows,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 },
    );
  }
}
