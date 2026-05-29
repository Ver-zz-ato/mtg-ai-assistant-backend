import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { parseTimeWindowPreset, queryVoiceAnalytics } from "@/lib/admin/voice-analytics-query";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const preset = url.searchParams.get("window") || url.searchParams.get("preset");
    const { since: presetSince, until: presetUntil } = parseTimeWindowPreset(preset);
    const result = await queryVoiceAnalytics({
      since: url.searchParams.get("since") || presetSince,
      until: url.searchParams.get("until") || presetUntil,
      tier: url.searchParams.get("tier"),
      mode: url.searchParams.get("mode"),
      outcome: url.searchParams.get("outcome"),
      screen: url.searchParams.get("screen"),
      matchQuality: url.searchParams.get("matchQuality"),
      clarifyReason: url.searchParams.get("clarifyReason"),
      limit: Math.min(parseInt(url.searchParams.get("limit") || "80", 10), 200),
      offset: Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10)),
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      rows: result.rows,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 },
    );
  }
}
