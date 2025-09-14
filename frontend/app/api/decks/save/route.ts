// app/api/decks/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SaveBody = {
  title?: string;
  deckText?: string;
  format?: string;
  plan?: string;
  colors?: string[];
  currency?: string;
  is_public?: boolean;
};

function parseDeckText(raw?: string): { name: string; qty: number }[] {
  if (!raw) return [];
  const out: Record<string, number> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    // formats: "2 Arcane Signet", "2x Arcane Signet", or "Arcane Signet" (qty=1)
    const m = t.match(/^\s*(\d+)x?\s+(.+?)\s*$/i);
    if (m) {
      const qty = Math.max(0, parseInt(m[1], 10) || 0);
      const name = m[2].trim();
      if (qty > 0 && name) out[name] = (out[name] ?? 0) + qty;
      continue;
    }
    // fallback: treat whole line as name, qty=1
    out[t] = (out[t] ?? 0) + 1;
  }
  return Object.entries(out).map(([name, qty]) => ({ name, qty }));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userRes, error: authErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: authErr?.message ?? "Unauthenticated" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as SaveBody;

    const is_public = body.is_public === true;
    const insertDeck = {
      user_id: user.id,
      title: body.title ?? "Untitled Deck",
      format: body.format ?? "Commander",
      plan: body.plan ?? "Optimized",
      colors: Array.isArray(body.colors) ? body.colors : [],
      currency: body.currency ?? "USD",
      deck_text: body.deckText ?? "",
      is_public,
      public: is_public, // keep legacy flag in sync
    };

    // 1) Insert the deck
    const { data: deckRow, error: deckErr } = await supabase
      .from("decks")
      .insert(insertDeck)
      .select("id, title, is_public")
      .single();

    if (deckErr || !deckRow) {
      return NextResponse.json({ ok: false, error: deckErr?.message ?? "Insert failed" }, { status: 400 });
    }

    const deckId = deckRow.id as string;

    // 2) Parse and insert cards (best-effort; ignore RLS errors so save still succeeds)
    const parsed = parseDeckText(body.deckText);
    if (parsed.length > 0) {
      const rows = parsed.map((c) => ({
        deck_id: deckId,
        name: c.name,
        qty: c.qty,
      }));

      // bulk insert in chunks of ~300 to be safe
      const CHUNK = 300;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: cardErr } = await supabase.from("deck_cards").insert(chunk);
        if (cardErr) {
          // If RLS blocks or a duplicate triggers, we still return success with a warning
          return NextResponse.json({
            ok: true,
            id: deckId,
            warning: "Deck saved, but some cards were not inserted (RLS or constraint).",
            card_error: cardErr.message,
          }, { status: 200 });
        }
      }
    }

    return NextResponse.json({ ok: true, id: deckId }, { status: 200 });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
