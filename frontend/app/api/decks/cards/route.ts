// app/api/decks/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function getDeckId(url: string) {
  const sp = new URL(url).searchParams;
  return sp.get("deckId") || sp.get("deckid") || sp.get("id");
}

export async function GET(req: NextRequest) {
  try {
    const deckId = getDeckId(req.url);
    if (!deckId) {
      return NextResponse.json({ ok: false, error: "deckId required" }, { status: 400 });
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("deck_cards")
      .select("id, deck_id, name, qty, created_at")
      .eq("deck_id", deckId)
      .order("name", { ascending: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, cards: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const deckId = getDeckId(req.url);
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const qty = Math.max(1, Number(body?.qty ?? 1) || 1);

    if (!deckId || !name) {
      return NextResponse.json({ ok: false, error: "deckId and name required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: uErr } = await supabase.auth.getUser();
    if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    // If unique(deck_id,name) is enforced, merge by incrementing when it already exists.
    const { data: existing } = await supabase
      .from("deck_cards")
      .select("id, qty")
      .eq("deck_id", deckId)
      .eq("name", name)
      .maybeSingle();

    if (existing?.id) {
      const newQty = Math.max(0, (existing.qty || 0) + qty);
      if (newQty <= 0) {
        await supabase.from("deck_cards").delete().eq("id", existing.id);
        return NextResponse.json({ ok: true, deleted: true });
      }
      const { error: upErr } = await supabase
        .from("deck_cards")
        .update({ qty: newQty })
        .eq("id", existing.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      return NextResponse.json({ ok: true, id: existing.id, qty: newQty, merged: true });
    }

    const { error: insErr, data } = await supabase
      .from("deck_cards")
      .insert({ deck_id: deckId, name, qty })
      .select("id")
      .single();

    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const deckId = getDeckId(req.url);
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const delta = Number(body?.delta);
    if (!id || !Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ ok: false, error: "id and non-zero numeric delta are required" }, { status: 400 });
    }

    const supabase = await createClient();
    // RLS will enforce ownership/visibility; we also read current qty.
    const { data: row, error: selErr } = await supabase
      .from("deck_cards")
      .select("id, qty")
      .eq("id", id)
      .maybeSingle();
    if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 });
    if (!row) return NextResponse.json({ ok: false, error: "Row not found" }, { status: 404 });

    const newQty = (row.qty || 0) + delta;
    if (newQty <= 0) {
      const { error: delErr } = await supabase.from("deck_cards").delete().eq("id", id);
      if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    } else {
      const { error: upErr } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      return NextResponse.json({ ok: true, qty: newQty });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = sp.get("id") || "";
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

    const supabase = await createClient();
    const { error } = await supabase.from("deck_cards").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
