// app/api/collections/cost-to-finish/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // your server-side helper

type InBody = {
  deckText?: string;
  deck_text?: string;
  deckId?: string;
  deck_id?: string;
  collectionId?: string;
  collection_id?: string;
  currency?: string;
  useOwned?: boolean;
  use_owned?: boolean;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as InBody;

    let deckText =
      body.deckText ??
      body.deck_text ??
      "";

    const deckId = body.deckId ?? body.deck_id ?? "";
    const collectionId = body.collectionId ?? body.collection_id ?? "";
    const currency = (body.currency ?? "USD").toUpperCase();
    const useOwned = (body.useOwned ?? body.use_owned ?? true) ? true : false;

    // If deckText not provided but deckId is, fetch it from Supabase
    if (!deckText && deckId) {
      const sb = createClient();
      const { data, error } = await sb
        .from("decks")
        .select("deck_text")
        .eq("id", deckId)
        .single();

      if (error || !data?.deck_text) {
        return NextResponse.json(
          { ok: false, error: "Deck not found or has no deck_text" },
          { status: 400 }
        );
      }
      deckText = data.deck_text;
    }

    if (!collectionId || !deckText) {
      return NextResponse.json(
        { ok: false, error: "Missing 'collection_id' or 'deck_text'" },
        { status: 400 }
      );
    }

    // IMPORTANT: point to your separate backend service (not this app)
    const BACKEND_ORIGIN =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.BACKEND_ORIGIN ||
      "";

    if (!BACKEND_ORIGIN) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "BACKEND_ORIGIN/NEXT_PUBLIC_BACKEND_URL not set on frontend. Set it to your backend service origin (e.g. https://mtg-ai-assistant-backend-1.onrender.com).",
        },
        { status: 500 }
      );
    }

    // Guard against accidental self-call
    const incomingHost = req.headers.get("host");
    const upstreamHost = new URL(BACKEND_ORIGIN).host;
    if (incomingHost && upstreamHost && incomingHost === upstreamHost) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Misconfiguration: BACKEND_ORIGIN points to this same app, causing a loop.",
        },
        { status: 500 }
      );
    }

    // Old backend endpoint expects snake_case and deck_text
    const payload = {
      collection_id: collectionId,
      deck_text: deckText,
      currency,
      use_owned: useOwned,
    };

    const r = await fetch(`${BACKEND_ORIGIN}/api/collections/cost`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      // don't cache; we want live collection numbers
      cache: "no-store",
    });

    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: out?.error || "Upstream call failed" },
        { status: 502 }
      );
    }
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
