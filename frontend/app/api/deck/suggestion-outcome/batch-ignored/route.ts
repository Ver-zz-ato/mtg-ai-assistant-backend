/**
 * POST: Log multiple suggestions as ignored (e.g. batch_replaced when user runs new analysis).
 * Body: { suggestion_ids: string[], deck_id?, format?, commander?, prompt_version_id?, prompt_version? }
 * Fail-open: returns 200 even if some or all writes fail.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = body?.suggestion_ids ?? body?.suggestion_ids;
    const arr = Array.isArray(raw) ? raw : [];
    const ids = [...new Set(arr.map((x: unknown) => String(x).trim()).filter(Boolean))];
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, logged: 0 });
    }

    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    // Bearer fallback for mobile
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    const deckId = body?.deck_id ? String(body.deck_id).trim() : null;
    const format = body?.format ?? null;
    const commander = body?.commander ?? null;
    const promptVersionId = body?.prompt_version_id != null ? String(body.prompt_version_id).trim() || null : (body?.prompt_version != null ? String(body.prompt_version).trim() || null : null);

    if (deckId) {
      const { data: deck } = await supabase.from("decks").select("id, user_id, is_public").eq("id", deckId).maybeSingle();
      if (!deck) {
        return NextResponse.json({ ok: false, error: "deck not found" }, { status: 404 });
      }
      const isOwner = user?.id && (deck as { user_id?: string }).user_id === user.id;
      const isPublic = (deck as { is_public?: boolean }).is_public === true;
      if (!isOwner && !isPublic) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
    }

    let logged = 0;
    try {
      const { logSuggestionOutcome } = await import("@/lib/data-moat/log-suggestion-outcome");
      for (const suggestion_id of ids) {
        const ok = await logSuggestionOutcome({
          suggestion_id,
          deck_id: deckId,
          user_id: user?.id ?? null,
          format,
          commander,
          prompt_version_id: promptVersionId,
          ignored: true,
          outcome_source: "batch_replaced",
        });
        if (ok) logged++;
      }
    } catch (e) {
      console.warn("[suggestion-outcome batch-ignored] log failed:", e);
    }
    return NextResponse.json({ ok: true, logged });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
