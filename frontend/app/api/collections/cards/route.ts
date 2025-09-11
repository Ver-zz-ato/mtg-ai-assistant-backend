// app/api/collections/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const collectionId = searchParams.get("collectionId");

  if (!collectionId) {
    return NextResponse.json({ ok: false, error: "collectionId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("collection_cards")
    .select("id, name, qty, created_at")
    .eq("collection_id", collectionId)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const { collectionId, name, qty } = body;

  if (!collectionId || !name) {
    return NextResponse.json({ ok: false, error: "collectionId and name are required" }, { status: 400 });
  }
  const initialQty = Number.isFinite(qty) ? Math.max(1, parseInt(String(qty), 10)) : 1;

  const { data: existing, error: selErr } = await supabase
    .from("collection_cards")
    .select("id, qty")
    .eq("collection_id", collectionId)
    .eq("name", name)
    .maybeSingle();

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });

  if (existing) {
    const { error: upErr } = await supabase
      .from("collection_cards")
      .update({ qty: existing.qty + initialQty })
      .eq("id", existing.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  } else {
    const { error: insErr } = await supabase
      .from("collection_cards")
      .insert([{ collection_id: collectionId, name, qty: initialQty }]);
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
    .from("collection_cards")
    .select("qty")
    .eq("id", id)
    .single();

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });

  const newQty = (current?.qty ?? 0) + delta;

  if (newQty <= 0) {
    const { error: delErr } = await supabase.from("collection_cards").delete().eq("id", id);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  } else {
    const { error: updErr } = await supabase.from("collection_cards").update({ qty: newQty }).eq("id", id);
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const { id } = body;

  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("collection_cards").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

