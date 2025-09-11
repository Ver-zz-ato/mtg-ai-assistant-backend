// app/api/decks/cards/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Contract (idempotent-ish):
// GET    /api/decks/cards?deckId=...                -> list
// POST   /api/decks/cards                           -> { deckId, name, qty } (create or upsert qty)
// PATCH  /api/decks/cards                           -> { deckId, name, delta } (+/- qty; deletes if <=0)
// DELETE /api/decks/cards                           -> { deckId, name } (remove row)

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deckId = searchParams.get("deckId");
  if (!deckId) {
    return NextResponse.json({ ok: false, error: "deckId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deck_cards")
    .select("id, deck_id, name, qty, created_at")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, cards: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { deckId, name, qty } = body || {};
  if (!deckId || !name) return NextResponse.json({ ok: false, error: "deckId and name required" }, { status: 400 });

  // Ensure ownership
  const { data: deck, error: dErr } = await supabase.from("decks").select("id, user_id").eq("id", deckId).single();
  if (dErr || !deck) return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  if (deck.user_id !== user.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  // Upsert-style: if exists, set qty; else insert
  const { data: existing } = await supabase.from("deck_cards").select("id, qty").eq("deck_id", deckId).eq("name", name).maybeSingle();

  if (existing) {
    const newQty = typeof qty === "number" ? qty : existing.qty;
    if (newQty <= 0) {
      await supabase.from("deck_cards").delete().eq("id", existing.id);
      return NextResponse.json({ ok: true, deleted: true });
    }
    const { error: upErr } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", existing.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: true });
  } else {
    const q = typeof qty === "number" ? qty : 1;
    const { error: insErr } = await supabase.from("deck_cards").insert({ deck_id: deckId, name, qty: q });
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, inserted: true });
  }
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { deckId, name, delta } = body || {};
  if (!deckId || !name || typeof delta !== "number") return NextResponse.json({ ok: false, error: "deckId, name, delta required" }, { status: 400 });

  const { data: deck, error: dErr } = await supabase.from("decks").select("id, user_id").eq("id", deckId).single();
  if (dErr || !deck) return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  if (deck.user_id !== user.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data: row } = await supabase.from("deck_cards").select("id, qty").eq("deck_id", deckId).eq("name", name).maybeSingle();
  const newQty = (row?.qty ?? 0) + delta;
  if (!row) {
    if (newQty <= 0) return NextResponse.json({ ok: true, nochange: true });
    const { error: insErr } = await supabase.from("deck_cards").insert({ deck_id: deckId, name, qty: newQty });
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, inserted: true });
  } else {
    if (newQty <= 0) {
      const { error: delErr } = await supabase.from("deck_cards").delete().eq("id", row.id);
      if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: true });
    } else {
      const { error: upErr } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", row.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, updated: true });
    }
  }
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { deckId, name } = body || {};
  if (!deckId || !name) return NextResponse.json({ ok: false, error: "deckId and name required" }, { status: 400 });

  const { data: deck, error: dErr } = await supabase.from("decks").select("id, user_id").eq("id", deckId).single();
  if (dErr || !deck) return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  if (deck.user_id !== user.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { error: delErr } = await supabase.from("deck_cards").delete().eq("deck_id", deckId).eq("name", name);
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: true });
}
