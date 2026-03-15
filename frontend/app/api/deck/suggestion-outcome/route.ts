/**
 * POST: Log a single suggestion outcome (rejected, ignored, or accepted from client).
 * Fail-open: returns 200 even if DB write fails. Used for Dismiss (rejected) and similar.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getDeckAccess(supabase: Awaited<ReturnType<typeof createClient>>, deckId: string, userId: string | undefined) {
  return supabase.from("decks").select("id, user_id, is_public, public").eq("id", deckId).maybeSingle();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const suggestionId = [body?.suggestion_id, body?.suggestionId].find(Boolean);
    const sid = suggestionId != null ? String(suggestionId).trim() : "";
    if (!sid) {
      return NextResponse.json({ ok: false, error: "suggestion_id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const deckId = body?.deck_id ? String(body.deck_id).trim() : null;

    if (deckId) {
      const { data: deck } = await getDeckAccess(supabase, deckId, user?.id);
      if (!deck) {
        return NextResponse.json({ ok: false, error: "deck not found" }, { status: 404 });
      }
      const isOwner = user?.id && (deck as { user_id?: string }).user_id === user.id;
      const isPublic = (deck as { is_public?: boolean; public?: boolean }).is_public || (deck as { public?: boolean }).public;
      if (!isOwner && !isPublic) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
    }

    try {
      const { logSuggestionOutcome } = await import("@/lib/data-moat/log-suggestion-outcome");
      await logSuggestionOutcome({
        suggestion_id: sid,
        deck_id: deckId ?? null,
        user_id: user?.id ?? null,
        suggested_card: body?.suggested_card ?? null,
        replaced_card: body?.replaced_card ?? null,
        category: body?.category ?? null,
        prompt_version_id: body?.prompt_version_id ?? body?.prompt_version ?? null,
        format: body?.format ?? null,
        commander: body?.commander ?? null,
        accepted: body?.accepted ?? null,
        rejected: body?.rejected ?? null,
        ignored: body?.ignored ?? null,
        outcome_source: body?.outcome_source ?? null,
      });
    } catch (e) {
      console.warn("[suggestion-outcome] log failed:", e);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
