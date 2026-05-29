import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getVoiceAnalyticsById } from "@/lib/admin/voice-analytics-query";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const result = await getVoiceAnalyticsById(id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
    }
    return NextResponse.json({ ok: true, event: result.row });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 },
    );
  }
}
