import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/* ----------------------------- helpers ----------------------------- */

const ok = (data: any, init: ResponseInit = { status: 200 }) =>
  NextResponse.json(data, init);
const err = (message: string, status = 400) =>
  NextResponse.json({ ok: false, error: message }, { status });

type CsvRow = { name: string; qty: number };

/** Tiny CSV parser that tolerates BOM, CRLF, quoted names, and varied headers. */
function parseCsv(input: string): CsvRow[] {
  let text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const split = (line: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else { q = !q; }
      } else if (ch === "," && !q) {
        out.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) => ["name","card","card name","card_name"].includes(h));
  const qtyIdx  = header.findIndex((h) => ["qty","quantity","count","owned","have"].includes(h));
  const looksHeader = nameIdx !== -1 || qtyIdx !== -1;
  const start = looksHeader ? 1 : 0;

  const rows: CsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = split(lines[i]);
    let name = "", qty = NaN;

    if (looksHeader) {
      name = String(parts[nameIdx] ?? "").replace(/^"|"$/g, "").trim();
      const rawQty = parts[qtyIdx];
      qty = Number(rawQty ?? 0);
    } else {
      const p = lines[i].split(/[;,]/).map((s) => s.trim());
      if (p.length === 1) { name = p[0]; qty = 1; }
      else {
        const a = Number(p[0]);
        const b = Number(p[p.length - 1]);
        if (Number.isFinite(a) && !Number.isFinite(b)) { qty = a; name = p.slice(1).join(", "); }
        else if (!Number.isFinite(a) && Number.isFinite(b)) { name = p.slice(0, -1).join(", "); qty = b; }
        else { name = p.slice(0, -1).join(", "); qty = Number.isFinite(b) ? b : 1; }
      }
    }

    name = name.replace(/^"|"$/g, "").trim();
    if (!name) continue;
    if (!Number.isFinite(qty)) qty = 1;
    qty = Math.max(0, Math.floor(qty));
    rows.push({ name, qty });
  }

  const dedup = new Map<string, number>();
  for (const r of rows) dedup.set(r.name, r.qty);
  return Array.from(dedup, ([name, qty]) => ({ name, qty }));
}

/** Auth + collection ownership */
async function getAuthedCollection(
  req: NextRequest,
  supabase: ReturnType<typeof createClient>
): Promise<{ userId: string; collectionId: string } | Response> {
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  const user = ures?.user;
  if (uerr || !user) return err("Not authenticated", 401);

  const url = new URL(req.url);
  let collectionId = url.searchParams.get("collectionId");

  if (!collectionId) {
    const ct = req.headers.get("content-type") || "";
    try {
      if (ct.includes("application/json")) {
        const b = await req.json();
        if (b?.collectionId) collectionId = String(b.collectionId);
      } else if (ct.includes("multipart/form-data")) {
        const fd = await req.formData();
        const v = fd.get("collectionId");
        if (typeof v === "string") collectionId = v;
      }
    } catch {}
  }
  if (!collectionId) return err("collectionId required", 400);

  const { data: col, error: colErr } = await supabase
    .from("collections")
    .select("id,user_id")
    .eq("id", collectionId)
    .single();

  if (colErr || !col) return err("Collection not found", 404);
  if (col.user_id !== user.id) return err("Forbidden", 403);

  return { userId: user.id as string, collectionId };
}

/* ------------------------------ GET list ------------------------------ */

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const auth = await getAuthedCollection(req, supabase);
  if (auth instanceof Response) return auth;

  const { collectionId } = auth;
  const { data, error } = await supabase
    .from("collection_cards")
    .select("id,name,qty")
    .eq("collection_id", collectionId)
    .order("name", { ascending: true });

  if (error) return err(error.message);
  return ok({ ok: true, cards: data ?? [] });
}

/* ------------------------------ POST add / CSV ------------------------------ */

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const auth = await getAuthedCollection(req, supabase);
  if (auth instanceof Response) return auth;
  const { collectionId } = auth;

  const ct = req.headers.get("content-type") || "";

  // CSV via multipart/form-data
  if (ct.includes("multipart/form-data")) {
    try {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!file || !(file instanceof Blob)) return err("file missing");
      const text = await (file as Blob).text();
      const rows = parseCsv(text);
      if (rows.length === 0) return err("No valid rows");

      let inserted = 0;
      for (const r of rows) {
        const up = await supabase
          .from("collection_cards")
          .upsert(
            { collection_id: collectionId, name: r.name, qty: r.qty },
            { onConflict: "collection_id,name" }
          )
          .select("id")
          .single();
        if (up.error) return err(up.error.message);
        inserted++;
      }
      return ok({ ok: true, inserted });
    } catch (e: any) {
      return err(e?.message || "CSV upload failed");
    }
  }

  // JSON bulk or single
  let body: any = {};
  try {
    if (ct.includes("application/json")) body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  if (Array.isArray(body?.rows)) {
    const normalized: CsvRow[] = body.rows
      .map((r: any) => ({
        name: String(r?.name ?? "").trim(),
        qty: Math.max(0, Math.floor(Number(r?.qty ?? r?.count ?? r?.owned ?? 0))),
      }))
      .filter((r: CsvRow) => r.name && Number.isFinite(r.qty));

    if (normalized.length === 0) return err("No valid rows");

    const payload = normalized.map((r: CsvRow) => ({
      collection_id: collectionId,
      name: r.name,
      qty: r.qty,
    }));

    const { error } = await supabase
      .from("collection_cards")
      .upsert(payload, { onConflict: "collection_id,name" });

    if (error) return err(error.message);
    return ok({ ok: true, inserted: normalized.length });
  }

  // Single add
  const name = String(body?.name ?? "").trim();
  const qty = Math.max(0, Math.floor(Number(body?.qty ?? 0)));
  if (!name) return err("name required");
  if (!Number.isFinite(qty)) return err("qty must be a number");

  const { error } = await supabase
    .from("collection_cards")
    .upsert(
      { collection_id: collectionId, name, qty },
      { onConflict: "collection_id,name" }
    )
    .select("id")
    .single();

  if (error) return err(error.message);
  return ok({ ok: true });
}

/* ------------------------------ PATCH qty ------------------------------ */
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const auth = await getAuthedCollection(req, supabase);
  if (auth instanceof Response) return auth;

  const { collectionId } = auth;

  let body: any = {};
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const id = body?.id ? String(body.id) : null;
  const name = body?.name ? String(body.name) : null;
  const qty = Math.max(0, Math.floor(Number(body?.qty ?? NaN)));
  if (!Number.isFinite(qty)) return err("qty required");
  if (!id && !name) return err("id or name required");

  // Build filters first, then .select()
  const baseUpdate = supabase.from("collection_cards").update({ qty });
  const updateBuilder = id
    ? baseUpdate.eq("id", id)
    : baseUpdate.eq("collection_id", collectionId).eq("name", name!);

  const { error } = await updateBuilder.select("id").single();
  if (error) return err(error.message);
  return ok({ ok: true });
}

/* ------------------------------ DELETE card ------------------------------ */
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const auth = await getAuthedCollection(req, supabase);
  if (auth instanceof Response) return auth;

  const { collectionId } = auth;

  let body: any = {};
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const id = body?.id ? String(body.id) : null;
  const name = body?.name ? String(body.name) : null;
  if (!id && !name) return err("id or name required");

  const baseDelete = supabase.from("collection_cards").delete();
  const deleteBuilder = id
    ? baseDelete.eq("id", id)
    : baseDelete.eq("collection_id", collectionId).eq("name", name!);

  const { error } = await deleteBuilder.select("id").single();
  if (error) return err(error.message);
  return ok({ ok: true });
}
