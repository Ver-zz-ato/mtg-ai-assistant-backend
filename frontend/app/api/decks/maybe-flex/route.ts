import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isMaybeFlexBucketEnabledForFormat,
  META_KEY_MAYBE_FLEX,
  normalizeMaybeFlexCards,
  type MaybeFlexCard,
} from "@/lib/deck/maybeFlexCards";

export const runtime = "nodejs";

/**
 * POST — persist `decks.meta.maybeFlexCards` for the signed-in deck owner.
 * Rejects when Maybe/Flex is disabled for the deck format (same gate as UI).
 */
export async function POST(req: NextRequest) {
  try {
    let supabase = await createClient();
    let {
      data: { user },
      error: uErr,
    } = await supabase.auth.getUser();

    if (!user && !uErr) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
          uErr = null;
        }
      }
    }

    if (uErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      deckId?: string;
      cards?: unknown;
    };
    const deckId = String(body.deckId || "").trim();
    if (!deckId) {
      return NextResponse.json({ ok: false, error: "deckId required" }, { status: 400 });
    }

    const { data: deck, error: deckErr } = await supabase
      .from("decks")
      .select("id, user_id, format, meta")
      .eq("id", deckId)
      .maybeSingle();

    if (deckErr || !deck) {
      return NextResponse.json({ ok: false, error: deckErr?.message || "Deck not found" }, { status: 400 });
    }
    if ((deck as { user_id: string }).user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (!isMaybeFlexBucketEnabledForFormat((deck as { format?: string }).format)) {
      return NextResponse.json(
        { ok: false, error: "Maybe / Flex cards are not available for this deck format." },
        { status: 400 },
      );
    }

    const cards: MaybeFlexCard[] = normalizeMaybeFlexCards(body.cards);

    const prevMeta = ((deck as { meta?: Record<string, unknown> }).meta || {}) as Record<string, unknown>;
    const nextMeta = { ...prevMeta, [META_KEY_MAYBE_FLEX]: cards };

    const { error: upErr } = await supabase.from("decks").update({ meta: nextMeta }).eq("id", deckId).eq("user_id", user.id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, cards });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
