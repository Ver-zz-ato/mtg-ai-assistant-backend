import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Helpers
function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}
function bad(message: string, status = 400) {
  return json({ ok: false, error: message }, status);
}

async function mustAuthed() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return { supabase, user: null as any, error: error || new Error("Not authenticated") };
  return { supabase, user: data.user, error: null as any };
}

async function ensureCollectionOwner(supabase: ReturnType<typeof createClient>, collectionId: string, userId: string) {
  const { data: col, error } = await supabase
    .from("collections")
    .select("id,user_id")
    .eq("id", collectionId)
    .single();

  if (error || !col) return "Collection not found";
  if (col.user_id !== userId) return "Forbidden";
  return null;
}

// GET  -> list cards in a collection
export async function GET(req: NextRequest) {
  const { supabase, user } = await mustAuthed();
  if (!user) return bad("Not authenticated", 401);

  const url = new URL(req.url);
  const collectionId = url.searchParams.get("collectionId");
  if (!collectionId) return bad("collectionId required");

  const ownerErr = await ensureCollectionOwner(supabase, collectionId, user.id);
  if (ownerErr) return bad(ownerErr, ownerErr === "Forbidden" ? 403 : 404);

  const { data, error: listErr } = await supabase
    .from("collection_cards")
    .select("id,name,qty")
    .eq("collection_id", collectionId)
    .order("name", { ascending: true });

  if (listErr) return bad(listErr.message);
  return json({ ok: true, cards: data ?? [] });
}

// POST -> add/upsert (single or bulk)
export async function POST(req: NextRequest) {
  const { supabase, user } = await mustAuthed();
  if (!user) return bad("Not authenticated", 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const collectionId = String(body.collectionId || "");
  if (!collectionId) return bad("collectionId required");

  const ownerErr = await ensureCollectionOwner(supabase, collectionId, user.id);
  if (ownerErr) return bad(ownerErr, ownerErr === "Forbidden" ? 403 : 404);

  const rows = Array.isArray(body.rows)
    ? body.rows
    : (body.name ? [{ name: body.name, qty: body.qty ?? 0 }] : []);

  const normalized = rows
    .map((r: any) => ({
      collection_id: collectionId,
      name: String(r.name ?? "").trim(),
      qty: Math.max(0, parseInt(String(r.qty ?? r.count ?? r.owned ?? 0), 10) || 0),
    }))
    .filter((r: any) => r.name);

  if (normalized.length === 0) return bad("No valid rows to upsert.");

  const { error: upErr } = await supabase
    .from("collection_cards")
    .upsert(normalized, { onConflict: "collection_id,name", ignoreDuplicates: false });

  if (upErr) return bad(upErr.message);
  return json({ ok: true });
}

// PATCH -> update qty (by id or by {collectionId, name})
export async function PATCH(req: NextRequest) {
  const { supabase, user } = await mustAuthed();
  if (!user) return bad("Not authenticated", 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const collectionId = String(body.collectionId || "");
  const id = body.id ? String(body.id) : null;
  const name = body.name ? String(body.name) : null;
  const qty = Math.max(0, parseInt(String(body.qty ?? 0), 10) || 0);

  if (!collectionId) return bad("collectionId required");
  const ownerErr = await ensureCollectionOwner(supabase, collectionId, user.id);
  if (ownerErr) return bad(ownerErr, ownerErr === "Forbidden" ? 403 : 404);

  if (!id && !name) return bad("id or name required");

  // NOTE: no .select().single().maybeSingle(); just perform update and check error
  let q = supabase.from("collection_cards").update({ qty });
  if (id) q = q.eq("id", id);
  else q = q.eq("collection_id", collectionId).eq("name", name!);

  const { error: updErr } = await q;
  if (updErr) return bad(updErr.message);

  return json({ ok: true });
}

// DELETE -> remove row (by id or {collectionId, name})
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await mustAuthed();
  if (!user) return bad("Not authenticated", 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const collectionId = String(body.collectionId || "");
  const id = body.id ? String(body.id) : null;
  const name = body.name ? String(body.name) : null;

  if (!collectionId) return bad("collectionId required");
  const ownerErr = await ensureCollectionOwner(supabase, collectionId, user.id);
  if (ownerErr) return bad(ownerErr, ownerErr === "Forbidden" ? 403 : 404);

  if (!id && !name) return bad("id or name required");

  let q = supabase.from("collection_cards").delete();
  if (id) q = q.eq("id", id);
  else q = q.eq("collection_id", collectionId).eq("name", name!);

  const { error: delErr } = await q;
  if (delErr) return bad(delErr.message);

  return json({ ok: true });
}
