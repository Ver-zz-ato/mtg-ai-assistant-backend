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
  const delta = typeof body?.delta === 'number' ? Number(body.delta) : null;
  const newNameRaw = body?.new_name ? String(body.new_name).trim() : null;
  if (!id) return NextResponse.json({ ok:false, error:'id required' }, { status:400 });

  const supabase = await createClient();
  const { data: row, error: selErr } = await supabase
    .from("deck_cards")
    .select("id, deck_id, name, qty")
    .eq("id", id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ ok: false, error: "Row not found" }, { status: 404 });

  // Rename path
  if (newNameRaw) {
    const newName = newNameRaw.replace(/\s*\(.*?\)\s*$/, '').trim();
    // If another row exists with same (case-sensitive) name, merge quantities
    const { data: existing } = await supabase
      .from('deck_cards')
      .select('id, qty')
      .eq('deck_id', row.deck_id)
      .eq('name', newName)
      .maybeSingle();
    if (existing?.id && existing.id !== row.id) {
      const mergedQty = (existing.qty || 0) + (row.qty || 0);
      const { error: up1 } = await supabase.from('deck_cards').update({ qty: mergedQty }).eq('id', existing.id);
      if (up1) return NextResponse.json({ ok:false, error: up1.message }, { status:400 });
      const { error: del } = await supabase.from('deck_cards').delete().eq('id', row.id);
      if (del) return NextResponse.json({ ok:false, error: del.message }, { status:400 });
      return NextResponse.json({ ok:true, id: existing.id, qty: mergedQty, merged: true, name: newName });
    } else {
      const { error: up } = await supabase.from('deck_cards').update({ name: newName }).eq('id', row.id);
      if (up) return NextResponse.json({ ok:false, error: up.message }, { status:400 });
      return NextResponse.json({ ok:true, id: row.id, name: newName });
    }
  }

  // Quantity delta path
  if (!Number.isFinite(delta as any) || (delta as number) === 0) {
    return NextResponse.json({ ok:false, error:'delta must be non-zero number when renaming is not requested' }, { status:400 });
  }
  const newQty = (row.qty || 0) + (delta as number);
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
    const deckId = getDeckId(req.url);
    
    // Support deletion by ID or by deck+name
    if (id) {
      const supabase = await createClient();
      const { error } = await supabase.from("deck_cards").delete().eq("id", id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    }
    
    // Delete by name (for direct commands)
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const qty = Math.max(1, Number(body?.qty ?? 1) || 1);
    
    if (!deckId || !name) {
      return NextResponse.json({ ok: false, error: "deckId and name required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("deck_cards")
      .select("id, qty")
      .eq("deck_id", deckId)
      .eq("name", name)
      .maybeSingle();

    if (!existing?.id) {
      return NextResponse.json({ ok: false, error: "Card not found in deck" }, { status: 404 });
    }

    const newQty = Math.max(0, (existing.qty || 0) - qty);
    if (newQty <= 0) {
      const { error } = await supabase.from("deck_cards").delete().eq("id", existing.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    } else {
      const { error } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", existing.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, qty: newQty });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
