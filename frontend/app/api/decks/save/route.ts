import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type CardRow = { name: string; qty: number };

function parseDeckText(text?: string | null): CardRow[] {
  if (!text) return [];
  const out: CardRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) out.push({ qty: Number(m[1]), name: m[2] });
    else out.push({ qty: 1, name: line });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ ok: false, error: authError.message }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { title, deckText, format, plan, colors, currency, is_public, commander } = body;

  if (!deckText) {
    return NextResponse.json({ ok: false, error: "deck_text is required" }, { status: 400 });
  }

  const cards = parseDeckText(deckText);

  const row = {
    user_id: user.id, // ✅ real logged-in user
    title: (title || "Untitled deck") as string,
    format: (format || "Commander") as string,
    plan: plan ?? null,
    colors: (colors ?? []) as string[],
    currency: (currency || "USD") as string,
    is_public: Boolean(is_public),
    commander: commander ?? null,

    // legacy string column
    deck_text: deckText as string,

    // structured JSON
    data: { cards },
    meta: { deck_text: deckText, saved_at: new Date().toISOString() },
  };

  const { data: inserted, error } = await supabase
    .from("decks")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: "Insert failed: " + error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id }, { status: 200 });
}
