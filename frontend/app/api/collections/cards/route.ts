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
  // Drop BOM if present
  let text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  // Normalize newlines
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  // Split a CSV line (handles quoted commas)
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) =>
    ["name", "card", "card name", "card_name"].includes(h)
  );
  const qtyIdx = header.findIndex((h) =>
    ["qty", "quantity", "count", "owned", "have"].includes(h)
  );

  const looksLikeHeader = nameIdx !== -1 || qtyIdx !== -1;
  const start = looksLikeHeader ? 1 : 0;

  const rows: CsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = split(lines[i]);
    let name = "";
    let qty = NaN;

    if (looksLikeHeader) {
      name = String(parts[nameIdx] ?? "").replace(/^"|"$/g, "").trim();
      const rawQty = parts[qtyIdx];
      qty = Number(rawQty ?? 0);
    } else {
      // bare lines: "2, Sol Ring" | "Sol Ring, 2" | "Sol Ring"
      const p = lines[i].split(/[;,]/).map((s) => s.trim());
      if (p.length === 1) {
        name = p[0];
        qty = 1;
      } else if (p.length >= 2) {
        const a = Number(p[0]);
        const b = Number(p[p.length - 1]);
        if (Number.isFinite(a) && !Number.isFinite(b)) {
          qty = a;
          name = p.slice(1).join(", ");
        } else if (!Number.isFinite(a) && Number.isFinite(b)) {
          name = p.slice(0, -1).join(", ");
          qty = b;
        } else {
          name = p.slice(0, -1).join(", ");
          qty = Number.isFinite(b) ? b : 1;
        }
      }
    }

    name = name.replace(/^"|"$/g, "").trim();
    if (!name) continue;
    if (!Number.isFinite(qty)) qty = 1;
    qty = Math.max(0, Math.floor(qty));

    rows.push({ name, qty });
  }

  // Dedup by name (last one wins)
  const dedup = new Map<string, number>();
  for (const r of rows) dedup.set(r.name, r.qty);
  return Array.from(dedup, ([name, qty]) => ({ name, qty }));
}

/** Auth + collection ownership (RLS still enforces; this gives friendly errors). */
async function getAuthedCollection(
  req: NextRequest,
  supabase: ReturnType<typeof createClient>
): Promise<{ userId: string; collectionId: string } | Response> {
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  const user = ures?.user;
  if (uerr || !user) return err("Not authenticated", 401);

  // Discover collectionId from query, JSON, or multipart form
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
    } catch {
      // ignore parse errors; we’ll error below if still missing
    }
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

      // Upsert each row (defensive against row-size limits)
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

  // JSON: either bulk rows or single add
  let body: any = {};
  try {
    if (ct.includes("application/json")) body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  if (Array.isArray(body?.rows)) {
    const normalized = body.rows
      .map((r: any) => ({
        name: String(r?.name ?? "").trim(),
        qty: Math.max(0, Math.floor(Number(r?.qty ?? r?.count ?? r?.owned ?? 0))),
      }))
      .filter((r: CsvRow) => r.name && Number.isFinite(r.qty));

    if (normalized.length === 0) return err("No valid rows");

    const payload = normalized.map((r) => ({
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

  // Update by id if provided; else by (collectionId+name)
  let q = supabase.from("collection_cards").update({ qty }).select("id");

  if (id) q = q.eq("id", id);
  else q = q.eq("name", name!); // collection ownership is already checked

  const { error } = await q.single();
  if (error) return err(error.message);
  return ok({ ok: true });
}

/* ------------------------------ DELETE card ------------------------------ */

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const auth = await getAuthedCollection(req, supabase);
  if (auth instanceof Response) return auth;

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

  let q = supabase.from("collection_cards").delete().select("id");
  if (id) q = q.eq("id", id);
  else q = q.eq("name", name!);

  const { error } = await q.single();
  if (error) return err(error.message);
  return ok({ ok: true });
}
