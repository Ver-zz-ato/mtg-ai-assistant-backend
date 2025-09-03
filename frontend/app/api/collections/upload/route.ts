// app/api/collections/upload/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET ping to verify route exists
export async function GET() {
  return NextResponse.json({ ok: true, route: "collections/upload" }, { status: 200 });
}

// Tiny CSV parser (header optional)
function parseCSV(text: string): Array<{ name: string; qty: number }> {
  const rows: Array<{ name: string; qty: number }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return rows;

  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const hasHeader = headers.some((h) =>
    ["name", "card", "qty", "quantity", "count", "owned"].includes(h)
  );

  let start = hasHeader ? 1 : 0;
  let nameIdx = 0,
    qtyIdx = 1;
  if (hasHeader) {
    const n = headers.findIndex((h) => ["name", "card"].includes(h));
    const q = headers.findIndex((h) => ["qty", "quantity", "count", "owned"].includes(h));
    if (n >= 0) nameIdx = n;
    if (q >= 0) qtyIdx = q;
  }

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (!cols.length) continue;

    // Support "2,Sol Ring" or "Sol Ring,2" when no header
    let name = "";
    let qty = 1;

    if (hasHeader) {
      name = cols[nameIdx] ?? "";
      qty = Number(cols[qtyIdx] ?? "1");
    } else {
      const a = cols[0] ?? "";
      const b = cols[1] ?? "";
      if (/^\d+$/.test(a)) {
        qty = Number(a);
        name = b;
      } else if (/^\d+$/.test(b)) {
        name = a;
        qty = Number(b);
      } else {
        name = a;
        qty = 1;
      }
    }

    name = name.trim();
    if (!name) continue;
    if (!Number.isFinite(qty) || qty < 0) qty = 1;

    rows.push({ name, qty });
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();

    // auth
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // read form
    const form = await req.formData();
    const collection_id = (form.get("collection_id") as string | null)?.trim();
    const file = form.get("file") as File | null;

    if (!collection_id) return NextResponse.json({ error: "Missing collection_id" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    // verify ownership (RLS protects us too; this gives nicer error)
    const { data: col, error: colErr } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collection_id)
      .single();
    if (colErr || !col) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

    // parse CSV
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return NextResponse.json({ error: "No rows found" }, { status: 400 });

    // sanity cap (avoid huge accidental uploads)
    const MAX_ROWS = 5000;
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Too many rows (>${MAX_ROWS})` }, { status: 400 });
    }

    // replace current contents
    const del = await supabase.from("collection_cards").delete().eq("collection_id", collection_id);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    // chunk inserts to avoid payload limits
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize).map((r) => ({
        collection_id,
        name: r.name,
        qty: r.qty,
      }));
      const { error: insErr, count } = await supabase
        .from("collection_cards")
        .insert(chunk, { count: "exact" });

      if (insErr) {
        return NextResponse.json({ error: insErr.message, inserted }, { status: 400 });
      }
      inserted += count ?? chunk.length;
    }

    return NextResponse.json({ ok: true, inserted }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResp
