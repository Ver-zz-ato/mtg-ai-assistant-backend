// frontend/app/api/collections/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const json = (data: any, init?: number | ResponseInit) =>
  NextResponse.json(data, typeof init === "number" ? { status: init } : init);
const bad = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

type CardRow = { id?: string; name: string; qty: number };

// ---------- helpers ----------
function cleanName(x: unknown) {
  return String(x ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getAuthedClient() {
  const supabase = createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    throw new Error("Not authenticated");
  }
  return { supabase, userId: userRes.user.id as string };
}

async function assertOwnsCollection(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  collectionId: string
) {
  const { data, error } = await supabase
    .from("collections")
    .select("id,user_id")
    .eq("id", collectionId)
    .single();

  if (error || !data) throw new Error("Collection not found");
  if (data.user_id !== userId) throw new Error("Forbidden");
}

// ---------- core handler ----------
async function handle(req: NextRequest) {
  const { supabase, userId } = await getAuthedClient().catch(() => ({} as any));
  if (!supabase || !userId) return bad("Not authenticated", 401);

  // collectionId may arrive via query (?collectionId=) or body
  const url = new URL(req.url);
  let collectionId = url.searchParams.get("collectionId");

  // Read body (if present) once
  let body: any = undefined;
  if (req.method !== "GET") {
    try {
      body = await req.json();
      if (!collectionId && body?.collectionId) {
        collectionId = String(body.collectionId);
      }
    } catch {
      // no-op: some verbs might not send a body
    }
  }

  // Methods that need collectionId
  const needsCollectionId = ["GET", "POST"];
  if (needsCollectionId.includes(req.method) && !collectionId) {
    return bad("collectionId required");
  }

  // Ownership check (skip for DELETE/PATCH when targeting by row id only? we’ll still verify)
  if (collectionId) {
    try {
      await assertOwnsCollection(supabase, userId, collectionId);
    } catch (e: any) {
      return bad(e?.message || "Forbidden", e?.message === "Forbidden" ? 403 : 404);
    }
  }

  // ------- GET: list cards -------
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("collection_cards")
      .select("id,name,qty")
      .eq("collection_id", collectionId!)
      .order("name", { ascending: true });

    if (error) return bad(error.message);
    return json({ ok: true, cards: data ?? [] });
  }

  // ------- POST: single add/upsert or bulk upsert -------
  if (req.method === "POST") {
    // Bulk upsert payload: { rows: [{name, qty}, ...] }
    if (Array.isArray(body?.rows)) {
      const rows: CardRow[] = body.rows
        .map((r: any) => ({
          name: cleanName(r?.name),
          qty: Number(r?.qty ?? r?.count ?? r?.owned ?? 0),
        }))
        .filter((r: CardRow) => r.name && Number.isFinite(r.qty));

      if (rows.length === 0) return bad("No valid rows");

      // Upsert by (collection_id, name)
      const { error } = await supabase.from("collection_cards").upsert(
        rows.map((r) => ({
          collection_id: collectionId!,
          name: r.name,
          qty: r.qty,
        })),
        { onConflict: "collection_id,name" }
      );

      if (error) return bad(error.message);
      return json({ ok: true });
    }

    // Single upsert: { name, qty }
    const name = cleanName(body?.name);
    const qty = Number(body?.qty);
    if (!name) return bad("name required");
    if (!Number.isFinite(qty)) return bad("qty must be a number");

    const { error } = await supabase
      .from("collection_cards")
      .upsert(
        [{ collection_id: collectionId!, name, qty }],
        { onConflict: "collection_id,name" }
      );

    if (error) return bad(error.message);
    return json({ ok: true });
  }

  // ------- PATCH: update qty by row id -------
  if (req.method === "PATCH") {
    const id = String(body?.id || "");
    const qty = Number(body?.qty);

    if (!id) return bad("id required");
    if (!Number.isFinite(qty)) return bad("qty must be a number");

    // Optional: verify the row belongs to the same user (defense-in-depth)
    const { data: row, error: rowErr } = await supabase
      .from("collection_cards")
      .select("id,collection_id")
      .eq("id", id)
      .single();

    if (rowErr || !row) return bad("Card row not found", 404);
    try {
      await assertOwnsCollection(supabase, userId, row.collection_id as string);
    } catch (e: any) {
      return bad(e?.message || "Forbidden", e?.message === "Forbidden" ? 403 : 404);
    }

    const { error } = await supabase.from("collection_cards").update({ qty }).eq("id", id);
    if (error) return bad(error.message);
    return json({ ok: true });
  }

  // ------- DELETE: remove row by id -------
  if (req.method === "DELETE") {
    const id = String(body?.id || "");
    if (!id) return bad("id required");

    // Optional: verify ownership via the row’s collection
    const { data: row, error: rowErr } = await supabase
      .from("collection_cards")
      .select("id,collection_id")
      .eq("id", id)
      .single();

    if (rowErr || !row) return bad("Card row not found", 404);
    try {
      await assertOwnsCollection(supabase, userId, row.collection_id as string);
    } catch (e: any) {
      return bad(e?.message || "Forbidden", e?.message === "Forbidden" ? 403 : 404);
    }

    const { error } = await supabase.from("collection_cards").delete().eq("id", id);
    if (error) return bad(error.message);
    return json({ ok: true });
  }

  return bad("Method not allowed", 405);
}

// Export the route handlers
export async function GET(req: NextRequest)  { try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
export async function POST(req: NextRequest) { try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
export async function PATCH(req: NextRequest){ try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
export async function DELETE(req: NextRequest){ try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
