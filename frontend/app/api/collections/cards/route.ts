import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Always reply JSON */
function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}
function bad(msg: string, status = 400) {
  return json({ ok: false, error: msg }, status);
}

export const runtime = "nodejs";

/** Helpers */
const normStr = (v: unknown) =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

const normQty = (v: unknown) => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

async function getAuthedSupabase() {
  const supabase = createClient();
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user) return { supabase, user: null as any, err: "Not authenticated" };
  return { supabase, user: ures.user, err: null as any };
}

/** Verify collection ownership before mutating/reading */
async function verifyCollection(supabase: any, collectionId: string, userId: string) {
  const { data, error } = await supabase
    .from("collections")
    .select("id,user_id")
    .eq("id", collectionId)
    .single();
  if (error || !data) return "Collection not found";
  if (data.user_id !== userId) return "Forbidden";
  return null;
}

/** GET -> list cards in collection */
export async function GET(req: NextRequest) {
  const { supabase, user, err } = await getAuthedSupabase();
  if (err) return bad(err, 401);

  const url = new URL(req.url);
  const collectionId = normStr(url.searchParams.get("collectionId"));
  if (!collectionId) return bad("collectionId required");

  const vcErr = await verifyCollection(supabase, collectionId, user.id);
  if (vcErr) return bad(vcErr, vcErr === "Forbidden" ? 403 : 404);

  const { data, error } = await supabase
    .from("collection_cards")
    .select("id, name, qty")
    .eq("collection_id", collectionId)
    .order("name", { ascending: true });

  if (error) return bad(error.message);
  return json({ ok: true, cards: data ?? [] });
}

/** POST -> add a single card OR bulk CSV rows */
export async function POST(req: NextRequest) {
  const { supabase, user, err } = await getAuthedSupabase();
  if (err) return bad(err, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const collectionId = normStr(body.collectionId);
  if (!collectionId) return bad("collectionId required");

  const vcErr = await verifyCollection(supabase, collectionId, user.id);
  if (vcErr) return bad(vcErr, vcErr === "Forbidden" ? 403 : 404);

  // Bulk upload: { rows:[{name, qty? | count? | owned?}] }
  if (Array.isArray(body.rows)) {
    const rows = body.rows
      .map((r: any) => ({
        collection_id: collectionId,
        name: normStr(r.name),
        qty: normQty(r.qty ?? r.count ?? r.owned),
      }))
      .filter((r: any) => r.name && r.qty > 0);

    if (rows.length === 0) return json({ ok: true, inserted: 0 });

    const { error } = await supabase
      .from("collection_cards")
      .upsert(rows, { onConflict: "collection_id,name" });

    if (error) return bad(error.message);
    return json({ ok: true, inserted: rows.length });
  }

  // Single add: { name, qty }
  const name = normStr(body.name);
  const qty = normQty(body.qty);

  if (!name) return bad("name required");
  if (qty <= 0) return bad("qty must be > 0");

  const { error } = await supabase
    .from("collection_cards")
    .upsert([{ collection_id: collectionId, name, qty }], {
      onConflict: "collection_id,name",
    });

  if (error) return bad(error.message);
  return json({ ok: true });
}

/** PATCH -> change quantity (by id OR by (collectionId+name)) */
export async function PATCH(req: NextRequest) {
  const { supabase, user, err } = await getAuthedSupabase();
  if (err) return bad(err, 401);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  const id = normStr(body.id);
  const collectionId = normStr(body.collectionId);
  const name = normStr(body.name);
  const qty = normQty(body.qty);

  if (!id && !(collectionId && name)) return bad("Provide id OR (collectionId + name)");

  if (id) {
    // Optional ownership check: fetch item -> its collection -> user
    const { data: item, error: iErr } = await supabase
      .from("collection_cards")
      .select("id,collection_id")
      .eq("id", id)
      .single();
    if (iErr || !item) return bad("Item not found", 404);

    const vcErr = await verifyCollection(supabase, item.collection_id, user.id);
    if (vcErr) return bad(vcErr, vcErr === "Forbidden" ? 403 : 404);

    if (qty <= 0) {
      const { error } = await supabase.from("collection_cards").delete().eq("id", id);
      if (error) return bad(error.message);
      return json({ ok: true, deleted: 1 });
    }

    const { error } = await supabase.from("collection_cards").update({ qty }).eq("id", id);
    if (error) return bad(error.message);
    return json({ ok: true });
  }

  // (collectionId + name)
  const vcErr = await verifyCollection(supabase, collectionId, user.id);
  if (vcErr) return bad(vcErr, vcErr === "Forbidden" ? 403 : 404);

  if (qty <= 0) {
    const { error } = await supabase
      .from("collection_cards")
      .delete()
      .eq("collection_id", collectionId)
      .eq("name", name);
    if (error) return bad(error.message);
    return json({ ok: true, deleted: 1 });
  }

  const { error } = await supabase
    .from("collection_cards")
    .update({ qty })
    .eq("collection_id", collectionId)
    .eq("name", name);

  if (error) return bad(error.message);
  return json({ ok: true });
}

/** DELETE -> by id OR (collectionId+name) */
export async function DELETE(req: NextRequest) {
  const { supabase, user, err } = await getAuthedSupabase();
  if (err) return bad(err, 401);

  const url = new URL(req.url);
  const id = normStr(url.searchParams.get("id"));
  const collectionId = normStr(url.searchParams.get("collectionId"));
  const name = normStr(url.searchParams.get("name"));

  if (!id && !(collectionId && name)) return bad("Provide id OR (collectionId + name)");

  if (id) {
    const { data: item, error: iErr } = await supabase
      .from("collection_cards")
      .select("id,collection_id")
      .eq("id", id)
      .single();
    if (iErr || !item) return bad("Item not found", 404);
    const vcErr = await verifyCollection(supabase, item.collection_id, user.id);
    if (vcErr) return bad(vcErr, vcErr === "Forbidden" ? 403 : 404);

    const { error } = await supabase.from("collection_cards").delete().eq("id", id);
    if (error) return bad(error.message);
    return json({ ok: true });
  }

  const vcErr = await verifyCollection(supabase, collectionId, user.id);
  if (vcErr) return bad(vcErr, vcErr === "Forbidden" ? 403 : 404);

  const { error } = await supabase
    .from("collection_cards")
    .delete()
    .eq("collection_id", collectionId)
    .eq("name", name);

  if (error) return bad(error.message);
  return json({ ok: true });
}
