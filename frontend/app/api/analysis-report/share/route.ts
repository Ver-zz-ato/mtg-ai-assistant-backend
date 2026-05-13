import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
    }
    const { supabase, user, authError } = await getUserAndSupabase(req);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const deckId = typeof body?.deckId === "string" ? body.deckId.trim() : null;
    const snapshotJson = body?.snapshotJson;
    if (!snapshotJson || typeof snapshotJson !== "object") {
      return NextResponse.json({ ok: false, error: "snapshotJson required" }, { status: 400 });
    }

    if (deckId) {
      const { data: deck } = await supabase.from("decks").select("user_id").eq("id", deckId).maybeSingle();
      if (!deck || (deck as { user_id: string }).user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 403 });
      }
    }

    const { data: row, error } = await supabase
      .from("shared_analysis_reports")
      .insert({
        user_id: user.id,
        deck_id: deckId || null,
        snapshot_json: snapshotJson,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (error || !row) {
      console.error("analysis_share_insert", error);
      return NextResponse.json({ ok: false, error: "Failed to save snapshot" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: (row as { id: string }).id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
