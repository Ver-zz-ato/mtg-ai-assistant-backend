import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/* ----------------------------- helpers ----------------------------- */

function json(data: any, init?: number | ResponseInit) {
  return NextResponse.json(data, init);
}
function bad(message: string, code = 400) {
  return json({ ok: false, error: message }, { status: code });
}

type CsvRow = { name: string; qty: number };

/** Tiny CSV parser that tolerates BOM, CRLF, quoted names, and varied headers. */
function parseCsv(input: string): CsvRow[] {
  // Drop BOM if present
  let text = input.replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  // Normalize newlines
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  // Split a CSV line (very small / safe—handles quoted commas)
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // double quote inside quotes -> escape
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
    return out.map(s => s.trim());
  };

  const header = split(lines[0]).map(h => h.toLowerCase());
  // Accept many header styles
  const nameIdx =
    header.findIndex(h =>
      ["name", "card", "card name", "card_name"].includes(h)
    );
  const qtyIdx =
    header.findIndex(h =>
      ["qty", "quantity", "count", "owned", "have"].includes(h)
    );

  const rows: CsvRow[] = [];

  // If the first row *isn’t* a header (e.g. “2, Sol Ring” or “Sol Ring, 2”)
  // fall back to bare lines mode.
  const looksLikeHeader = nameIdx !== -1 || qtyIdx !== -1;
  const start = looksLikeHeader ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const parts = split(lines[i]);
    let name = "";
    let qty = NaN;

    if (looksLikeHeader) {
      name = String(parts[nameIdx] ?? "").replace(/^"|"$/g, "").trim();
      const rawQty = parts[qtyIdx];
      qty = Number(rawQty ?? 0);
    } else {
      // bare lines:
      // "2, Sol Ring" | "Sol Ring, 2" | "2; Sol Ring" | "Sol Ring; 2" | "Sol Ring"
      const p = lines[i].split(/[;,]/).map(s => s.trim());
      if (p.length === 1) {
        name = p[0];
        qty = 1;
      } else if (p.length >= 2) {
        const a = Number(p[0]);
        const b = Number(p[p.length - 1]);
        if (Number.isFinite(a) && !Number.isFinite(b)) {
          qty = a;
          name = p.slice(1).join(", "); // in case commas inside name
        } else if (!Number.isFinite(a) && Number.isFinite(b)) {
          name = p.slice(0, -1).join(", ");
          qty = b;
        } else {
          // ambiguous: default to last token as qty
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

  // Deduplicate by name (keep the last occurrence)
  const dedup = new Map<string, number>();
  for (const r of rows) dedup.set(r.name, r.qty);
  return Array.from(dedup, ([name, qty]) => ({ name, qty }));
}

/** Auth guard + quick collection ownership check (RLS still enforces). */
async function getAuthedCollection(
  req: NextRequest,
  supabase: ReturnType<typeof createClient>
) {
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  const user = ures?.user;
  if (uerr || !user) return { err: bad("Not authenticated", 401) };

  // Pull collectionId from query first, then JSON, then form data
  const url = new URL(req.url);
  let collectionId = url.searchParams.get("collectionId");

  if (!collectionId) {
    // Try JSON
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const b = await req.json();
        if (b?.collectionId) collectionId = String(b.collectionId);
      }
    } catch {}
  }
  if (!collectionId) {
    // Try multipart/form-data
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("multipart/form-data")) {
        const fd = await req.formData();
        const v = fd.get("collectionId");
        if (typeof v === "string") collectionId = v;
      }
    } catch {}
  }
  if (!collectionId) return { err: bad("collectionId required") };

  const { data: col, error: colErr } = await supabase
    .from("collections")
    .select("id, user_id")
    .eq("id", collectionId)
    .single();

  if (colErr || !col) return { err: bad("Collection not found", 404) };
  if (col.user_id !== user.id) return { err: bad("Forbidden", 403) };

  return { user, collectionId };
}

/* ------------------------------ GET list ------------------------------ */

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const auth = await getAuthedCollection(req, supabase);
    if ("err" in auth) return auth.err;

    const { collectionId } = auth;
    const { data, error } = await supabase
      .from("collection_cards")
      .select("id, name, qty")
      .eq("collection_id", collectionId)
      .order("name", { ascending: true });

    if (error) return bad(error.message);
    return json({ ok: true, cards: data ?? [] });
  } catch (e: any) {
    return bad(e?.message || "Unexpected error");
  }
}

/* ------------------------------ POST add / CSV ------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const auth = await getAuthedCollection(req, supabase);
    if ("err" in auth) return auth.err;

    const { collectionId } = auth;
    const ct = req.headers.get("content-type") || "";

    // 1) CSV via multipart/form-data (input[type=file])
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");

      if (!file || !(file instanceof Blob)) return bad("file missing");
      const text = await (file as Blob).text();
      const rows = parseCsv(text);

      if (rows.length === 0) return bad("No valid rows");

      // Upsert each (collection_id, name)
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

        if (up.error) return bad(up.error.message);
        inserted++;
      }
      return json({ ok: true, inserted });
    }

    // 2) JSON body: add a single card by name
    const body = ct.includes("application/json") ? await req.json() : {};
    const name = String(body?.name ?? "").trim();
    const qty = Math.max(0, Math.floor(Number(body?.qty ?? 1)));
    if (!name) return bad("name required");

    const { error } = await supabase
      .from("collection_cards")
      .upsert(
        { collection_id: collectionId, name, qty },
        { onConflict: "collection_id,name" }
      )
      .select("id")
      .single();

    if (error) return bad(error.message);
    return json({ ok: true });
  } catch (e: any) {
    // If fetch/parse fails (e.g., body read twice), surface it as JSON
    return bad(e?.message || "Unexpected error");
  }
}

/* ------------------------------ PATCH qty ------------------------------ */

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const auth = await getAuthedCollection(req, supabase);
    if ("err" in auth) return auth.err;

    const { collectionId } = auth;

    const ct = req.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await req.json() : {};
    const id = body?.id ? String(body.id) : null;
    const name = body?.name ? String(body.name) : null;
    const qty = Math.max(0, Math.floor(Number(body?.qty ?? NaN)));
    if (!Number.isFinite(qty)) return bad("qty required");

    let q = supabase.from("collection_cards").update({ qty }).select("id");

    if (id) q = q.eq("id", id);
    else if (name) q = q.eq("collection_id", collectionId).eq("name", name);
    else return bad("id or name required");

    const { error } = await q.single();
    if (error) return bad(error.message);

    return json({ ok: true });
  } catch (e: any) {
    return bad(e?.message || "Unexpected error");
  }
}

/* ------------------------------ DELETE card ------------------------------ */

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const auth = await getAuthedCollection(req, supabase);
    if ("err" in auth) return auth.err;

    const { collectionId } = auth;
    const ct = req.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await req.json() : {};
    const id = body?.id ? String(body.id) : null;
    const name = body?.name ? String(body.name) : null;

    let q = supabase.from("collection_cards").delete().select("id");

    if (id) q = q.eq("id", id);
    else if (name) q = q.eq("collection_id", collectionId).eq("name", name);
    else return bad("id or name required");

    const { error } = await q.single();
    if (error) return bad(error.message);

    return json({ ok: true });
  } catch (e: any) {
    return bad(e?.message || "Unexpected error");
  }
}
