import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SaveDeckBodyLoose = {
  // preferred
  title?: string | null;
  deck_text?: string | null;
  is_public?: boolean | null;

  // common variants we’ll accept
  name?: string | null;
  deckName?: string | null;
  deck?: string | null;
  deckText?: string | null;
  list?: string | null;
  text?: string | null;
};

function pickTitle(body: SaveDeckBodyLoose): string | null {
  const candidate =
    body.title ??
    body.name ??
    body.deckName ??
    null;
  const t = typeof candidate === "string" ? candidate.trim() : "";
  return t.length ? t : null;
}

function pickDeckText(body: SaveDeckBodyLoose): string | null {
  const candidate =
    body.deck_text ??
    body.deckText ??
    body.deck ??
    body.list ??
    body.text ??
    null;
  const v = typeof candidate === "string" ? candidate.trim() : "";
  return v.length ? v : null;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = (await req.json()) as SaveDeckBodyLoose | null;

    // Pull values from any common key
    const title = pickTitle(raw ?? {}) ?? "Untitled Deck";
    const deck_text = pickDeckText(raw ?? {});

    const is_public = Boolean(raw?.is_public);

    if (!deck_text) {
      return NextResponse.json(
        { error: 'Missing deck text. Provide "deck_text" (or deckText/deck/list/text).' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title,
        deck_text,
        is_public,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
