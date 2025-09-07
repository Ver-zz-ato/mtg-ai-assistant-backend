// Force Node runtime (we need cookies + Supabase server client)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

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

function backendBase(): string {
  // Use the same var you configured on Render; no trailing slash.
  const url =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:3001";
  return url.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as InBody;

    // Accept both camelCase & snake_case, with sensible defaults
    let deckText = body.deckText ?? body.deck_text ?? null;
    const deckId = body.deckId ?? body.deck_id ?? null;
    const collectionId = body.collectionId ?? body.collection_id ?? null;
    const currency = (body.currency ?? "USD").toUpperCase();
    const useOwned =
      body.useOwned ?? body.use_owned ?? Boolean(collectionId);

    // If no deckText was provided but a deckId was, read it via Supabase under RLS
    if (!deckText && deckId) {
      const supabase = createRouteHandlerClient({ cookies });
      const { data, error } = await supabase
        .from("decks")
        .select("deck_text")
        .eq("id", deckId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { ok: false, error: `Deck lookup failed: ${error.message}` },
          { status: 400 }
        );
      }
      if (!data || !data.deck_text) {
        return NextResponse.json(
          { ok: false, error: "Deck not found or no deck_text" },
          { status: 404 }
        );
      }
      deckText = data.deck_text as string;
    }

    if (!deckText || typeof deckText !== "string" || !deckText.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing `deckText`/`deck_text`" },
        { status: 400 }
      );
    }

    // Build payload for Python backend
    const payload: Record<string, unknown> = {
      deck_text: deckText,
      currency,
    };

    if (useOwned) {
      if (!collectionId) {
        return NextResponse.json(
          { ok: false, error: "useOwned=true requires collectionId" },
          { status: 400 }
        );
      }
      payload.collection_id = collectionId;
      payload.use_owned = true;
    }

    const res = await fetch(
      `${backendBase()}/api/collections/cost`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        // avoid caching; always compute fresh
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `Upstream error (${res.status}): ${text}` },
        { status: 502 }
      );
    }

    const out = await res.json();
    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unhandled error" },
      { status: 500 }
    );
  }
}
