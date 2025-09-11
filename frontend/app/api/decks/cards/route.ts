// app/api/decks/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Parse lines like "3 Lightning Bolt" (ignores blank lines and lines starting with "#"). */
function parseDeckText(raw: string): Array<{ name: string; qty: number }> {
  const map = new Map<string, number>();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(\d+)\s+(.+?)\s*$/);
    if (!m) continue;
    const qty = parseInt(m[1], 10);
    const name = m[2].replace(/\s+/g, " ").trim();
    if (!name || !Number.isFinite(qty) || qty <= 0) continue;
    const key = name.toLowerCase();
    map.set(key, (map.get(key) ?? 0) + qty);
  }
  // naive title-case fallback to present nicely
  return Array.from(map.entries()).map(([lower, qty]) => ({
    name: lower.replace(/\b\w/g, (c) => c.toUpperCase()),
    qty,
  }));
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const deckId = searchParams.get("deckId");

  if (!deckId) {
    return NextResponse.json({ ok: false, error: "deckId is required" }, { status: 400 });
  }

  // 1) load existing items
  let { data: items, error } = await supabase
    .from("deck_cards")
    .select("id, name, qty, created_at")
    .eq("deck_id", deckId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // 2) If empty, try to hydrate from deck text (owner will be allowed by RLS)
  if (!items || items.length === 0) {
    const { data: deck, error: deckErr } = await supabase
      .from("decks")
      .select("*")
      .eq("id", deckId)
      .maybeSingle();
    if (!deckErr && deck) {
      // heuristics to find a text field
      const candidates = ["text", "deck_text", "list_text", "raw_text", "content"];
      let raw: string | null = null;
      for (const k of candidates) {
        if (typeof (deck as any)[k] === "string" && (deck as any)[k].trim().length > 0) {
          raw = (deck as any)[k];
          break;
        }
      }
      if (!raw) {
        for (const [k, v] of Object.entries(deck)) {
          if (typeof v === "string" && v.trim().length > 0) {
            if (!raw || v.length > (raw?.length ?? 0)) raw = v;
          }
        }
      }
      if (raw) {
        const parsed = parseDeckText(raw);
        if (parsed.length > 0) {
          // upsert each row by (deck_id, name)
          for (const it of parsed) {
            const { data: existing } = await supabase
              .from("deck_cards")
              .select("id, qty")
              .eq("deck_id", deckId)
              .eq("name", it.name)
              .maybeSingle();
            if (existing) {
              await supabase.from("deck_cards").update({ qty: it.qty }).eq("id", existing.id);
            } else {
              await supabase.from("deck_cards").insert([{ deck_id: deckId, name: it.name, qty: it.qty }]);
            }
          }
          // re-load
          const res = await supabase
            .from("deck_cards")
            .select("id, name, qty, created_at")
            .eq("deck_id", deckId)
            .order("name", { ascending: true });
          items = res.data ?? [];
        }
      }
    }
  }

  return NextResponse.json({ ok: true, items: items ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const { deckId, name, qty } = body;

  if (!deckId || !name) {
    return NextResponse.json({ ok: false, error: "deckId and name are required" }, { status: 400 });
  }
  const initialQty = Number.isFinite(qty) ? Math.max(1, parseInt(String(qty), 10)) : 1;

  const { data: existing, error: selErr } = await supabase
    .from("deck_cards")
    .select("id, qty")
    .eq("deck_id", deckId)
    .eq("name", name)
    .maybeSingle();

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });

  if (existing) {
    const { error: upErr } = await supabase
      .from("deck_cards")
      .update({ qty: existing.qty + initialQty })
      .eq("id", existing.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  } else {
    const { error: insErr } = await supabase
      .from("deck_cards")
      .insert([{ deck_id: deckId, name, qty: initialQty }]);
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const { id, delta } = body;

  if (!id || typeof delta !== "number" || delta === 0) {
    return NextResponse.json({ ok: false, error: "id and non-zero numeric delta are required" }, { status: 400 });
  }

  const { data: current, error: selErr } = await supabase
    .from("deck_cards")
    .select("qty")
    .eq("id", id)
    .single();

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });

  const newQty = (current?.qty ?? 0) + delta;

  if (newQty <= 0) {
    const { error: delErr } = await supabase.from("deck_cards").delete().eq("id", id);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  } else {
    const { error: updErr } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", id);
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const { id } = body;

  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("deck_cards").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
