import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const json = (data: any, init?: number | ResponseInit) =>
  NextResponse.json(data, typeof init === "number" ? { status: init } : init);
const bad = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

type CardRow = { id?: string; name: string; qty: number };

function cleanName(x: unknown) {
  return String(x ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getAuthedClient() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Not authenticated");
  return { supabase, userId: data.user.id as string };
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

/* ---------- CSV parsing ---------- */

function parseCsv(text: string): CardRow[] {
  const rows: CardRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return rows;

  // Helper: split line on comma or tab, but keep inner commas in names simple enough
  const split = (s: string) => s.split(/\t|,(?![^"]*")/).map((t) => t.replace(/^"|"$/g, "").trim());

  // detect headers
  const first = split(lines[0]).map((h) => h.toLowerCase());
  const looksHeader = first.some((h) => ["name", "qty", "count", "owned"].includes(h));

  let start = 0;
  let nameIdx = -1, qtyIdx = -1;
  if (looksHeader) {
    start = 1;
    nameIdx = first.findIndex((h) => h === "name");
    qtyIdx = first.findIndex((h) => h === "qty" || h === "count" || h === "owned");
  }

  for (let i = start; i < lines.length; i++) {
    const parts = split(lines[i]);

    // headered: read by column
    if (looksHeader) {
      const nm = nameIdx >= 0 ? parts[nameIdx] : undefined;
      const qv = qtyIdx >= 0 ? parts[qtyIdx] : undefined;
      const name = cleanName(nm);
      const qty = Number(qv ?? 1);
      if (name && Number.isFinite(qty)) rows.push({ name, qty });
      continue;
    }

    // bare lines:
    // 1) "2, Sol Ring" or "2\tSol Ring"
    // 2) "Sol Ring"  -> qty=1
    const [a, ...rest] = parts;
    const maybeNum = Number(a);
    if (Number.isFinite(maybeNum) && rest.length > 0) {
      rows.push({ name: cleanName(rest.join(" ")), qty: maybeNum });
    } else {
      rows.push({ name: cleanName(parts.join(" ")), qty: 1 });
    }
  }

  return rows;
}

/* ---------- body helpers ---------- */

async function readJson(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

async function readForm(req: NextRequest) {
  try {
    return await req.formData();
  } catch {
    return undefined;
  }
}

/* ---------- handler ---------- */

async function handle(req: NextRequest) {
  const { supabase, userId } = await getAuthedClient().catch(() => ({} as any));
  if (!supabase || !userId) return bad("Not authenticated", 401);

  const url = new URL(req.url);

  // try to pick collectionId from query, json, or form
  let collectionId: string | null = url.searchParams.get("collectionId");
  let body: any = undefined;
  let form: FormData | undefined;

  // read body if needed
  if (req.method !== "GET") {
    // heuristics: if multipart, read form; else try JSON
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("multipart/form-data")) {
      form = await readForm(req);
      if (!collectionId && form?.get("collectionId")) {
        collectionId = String(form.get("collectionId"));
      }
    } else {
      body = await readJson(req);
      if (!collectionId && body?.collectionId) {
        collectionId = String(body.collectionId);
      }
    }
  }

  const needsCollectionId = ["GET", "POST"];
  if (needsCollectionId.includes(req.method) && !collectionId) {
    return bad("collectionId required");
  }

  if (collectionId) {
    try {
      await assertOwnsCollection(supabase, userId, collectionId);
    } catch (e: any) {
      return bad(e?.message || "Forbidden", e?.message === "Forbidden" ? 403 : 404);
    }
  }

  /* ----- GET: list cards ----- */
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("collection_cards")
      .select("id,name,qty")
      .eq("collection_id", collectionId!)
      .order("name", { ascending: true });

    if (error) return bad(error.message);
    return json({ ok: true, cards: data ?? [] });
  }

  /* ----- POST: add/upsert (single, bulk-JSON, or CSV form) ----- */
  if (req.method === "POST") {
    // CSV form-data path: { file, collectionId }
    if (form && form.get("file") instanceof File) {
      const file = form.get("file") as File;
      if (!file) return bad("file required");
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) return bad("No valid rows in CSV");

      const payload = rows.map((r) => ({
        collection_id: collectionId!,
        name: cleanName(r.name),
        qty: Number(r.qty),
      }));

      const { error } = await supabase
        .from("collection_cards")
        .upsert(payload, { onConflict: "collection_id,name" });

      if (error) return bad(error.message);
      return json({ ok: true, inserted: rows.length });
    }

    // Bulk JSON path: { rows: [...] }
    if (Array.isArray(body?.rows)) {
      const rows: CardRow[] = body.rows
        .map((r: any) => ({
          name: cleanName(r?.name),
          qty: Number(r?.qty ?? r?.count ?? r?.owned ?? 0),
        }))
        .filter((r) => r.name && Number.isFinite(r.qty));

      if (rows.length === 0) return bad("No valid rows");

      const payload = rows.map((r) => ({
        collection_id: collectionId!,
        name: r.name,
        qty: r.qty,
      }));

      const { error } = await supabase
        .from("collection_cards")
        .upsert(payload, { onConflict: "collection_id,name" });

      if (error) return bad(error.message);
      return json({ ok: true, inserted: rows.length });
    }

    // Single add/upsert: { name, qty }
    const name = cleanName(body?.name);
    const qty = Number(body?.qty);
    if (!name) return bad("name required");
    if (!Number.isFinite(qty)) return bad("qty must be a number");

    const { error } = await supabase
      .from("collection_cards")
      .upsert([{ collection_id: collectionId!, name, qty }], {
        onConflict: "collection_id,name",
      });

    if (error) return bad(error.message);
    return json({ ok: true });
  }

  /* ----- PATCH: update qty by row id (JSON or form-data) ----- */
  if (req.method === "PATCH") {
    let id: string | undefined;
    let qty: number | undefined;

    if (form) {
      id = form.get("id") ? String(form.get("id")) : undefined;
      qty = form.get("qty") != null ? Number(form.get("qty")) : undefined;
    } else {
      id = body?.id ? String(body.id) : undefined;
      qty = body?.qty != null ? Number(body.qty) : undefined;
    }

    if (!id) return bad("id required");
    if (!Number.isFinite(qty)) return bad("qty must be a number");

    // Ensure ownership via the row’s collection
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

  /* ----- DELETE: remove row by id (JSON or form-data) ----- */
  if (req.method === "DELETE") {
    let id: string | undefined;
    if (form) id = form.get("id") ? String(form.get("id")) : undefined;
    else id = body?.id ? String(body.id) : undefined;

    if (!id) return bad("id required");

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

export async function GET(req: NextRequest)    { try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
export async function POST(req: NextRequest)   { try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
export async function PATCH(req: NextRequest)  { try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
export async function DELETE(req: NextRequest) { try { return await handle(req); } catch (e: any) { return bad(e?.message || "Unexpected error", 500); } }
