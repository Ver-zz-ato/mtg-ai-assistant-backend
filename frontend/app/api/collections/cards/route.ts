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

  // Use service role client to check if collection is public (bypasses RLS)
  // This allows us to check public status even for anonymous users
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  // Use service role if available, otherwise anon key
  const metaClient = serviceKey 
    ? createServiceClient(url, serviceKey, { auth: { persistSession: false } })
    : createServiceClient(url, anonKey, { auth: { persistSession: false } });
  
  // Check if collection is public - use service role to bypass RLS
  const { data: meta } = await metaClient
    .from("collection_meta")
    .select("is_public, visibility")
    .eq("collection_id", collectionId)
    .maybeSingle();
  
  // If collection is public, use service role client to bypass RLS for fetching cards
  let client = supabase;
  if (meta && (meta.is_public === true || meta.visibility === 'public')) {
    if (serviceKey) {
      client = createServiceClient(url, serviceKey, { auth: { persistSession: false } }) as any;
    }
  } else {
    // If not public, require authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const { data, error } = await client
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
  let { collectionId, name, qty } = body;

  if (!collectionId || !name) {
    return NextResponse.json({ ok: false, error: "collectionId and name are required" }, { status: 400 });
  }
  
  // Validate and fix card name before adding (unless skipValidation is true)
  if (!body.skipValidation) {
    try {
      const fuzzyRes = await fetch(`${req.nextUrl.origin}/api/cards/fuzzy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [name] })
      });
      const fuzzyData = await fuzzyRes.json().catch(() => ({}));
      const suggestion = fuzzyData?.results?.[name]?.suggestion;
      // Use suggestion if it exists and is different (case-insensitive check)
      if (suggestion && suggestion.toLowerCase() !== name.toLowerCase()) {
        name = suggestion; // Auto-fix the name
      }
    } catch (e) {
      // Continue with original name if validation fails
      console.warn('[collections/cards] Name validation failed, using original name:', e);
    }
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
    const newQty = existing.qty + initialQty;
    const { error: upErr } = await supabase
      .from("collection_cards")
      .update({ qty: newQty })
      .eq("id", existing.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: existing.id, qty: newQty, merged: true });
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("collection_cards")
      .insert([{ collection_id: collectionId, name, qty: initialQty }])
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: inserted?.id, qty: initialQty, merged: false });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const { id, delta, new_name } = body;

  if (!id) return NextResponse.json({ ok:false, error:'id required' }, { status:400 });

  // Rename path
  if (typeof new_name === 'string' && new_name.trim()) {
    const { data: row } = await supabase.from('collection_cards').select('id, collection_id, name, qty').eq('id', id).maybeSingle();
    if (!row) return NextResponse.json({ ok:false, error:'row not found' }, { status:404 });
    const next = String(new_name).replace(/\s*\(.*?\)\s*$/, '').trim();
    const { data: existing } = await supabase.from('collection_cards').select('id, qty').eq('collection_id', row.collection_id).eq('name', next).maybeSingle();
    if (existing?.id && existing.id !== row.id) {
      const merged = (existing.qty||0) + (row.qty||0);
      const { error: up1 } = await supabase.from('collection_cards').update({ qty: merged }).eq('id', existing.id);
      if (up1) return NextResponse.json({ ok:false, error: up1.message }, { status:400 });
      const { error: del } = await supabase.from('collection_cards').delete().eq('id', row.id);
      if (del) return NextResponse.json({ ok:false, error: del.message }, { status:400 });
      return NextResponse.json({ ok:true, id: existing.id, qty: merged, merged:true, name: next });
    } else {
      const { error: up } = await supabase.from('collection_cards').update({ name: next }).eq('id', row.id);
      if (up) return NextResponse.json({ ok:false, error: up.message }, { status:400 });
      return NextResponse.json({ ok:true, id: row.id, name: next });
    }
  }

  if (typeof delta !== "number" || delta === 0) {
    return NextResponse.json({ ok: false, error: "delta must be non-zero when not renaming" }, { status: 400 });
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

