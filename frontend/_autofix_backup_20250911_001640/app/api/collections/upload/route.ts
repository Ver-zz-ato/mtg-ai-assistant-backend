import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let nameIdx = 0, qtyIdx = 1;
  if (hasHeader) {
    const n = headers.findIndex((h) => ["name", "card"].includes(h));
    const q = headers.findIndex((h) => ["qty", "quantity", "count", "owned"].includes(h));
    if (n >= 0) nameIdx = n;
    if (q >= 0) qtyIdx = q;
  }

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (!cols.length) continue;

    let name = "";
    let qty = 1;

    if (hasHeader) {
      name = cols[nameIdx] ?? "";
      qty = Number(cols[qtyIdx] ?? "1");
    } else {
      const a = cols[0] ?? "";
      const b = cols[1] ?? "";
      if (/^\d+$/.test(a)) { qty = Number(a); name = b; }
      else if (/^\d+$/.test(b)) { name = a; qty = Number(b); }
      else { name = a; qty = 1; }
    }

    name = name.trim();
    if (!name) continue;
    if (!Number.isFinite(qty) || qty < 0) qty = 1;

    rows.push({ name, qty });
  }

  return rows;
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "collections/upload" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const collection_id = (form.get("collection_id") as string | null)?.trim();
    const file = form.get("file") as File | null;

    if (!collection_id) return NextResponse.json({ ok: false, error: "Missing collection_id" }, { status: 400 });
    if (!file)          return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });

    const { data: col, error: colErr } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collection_id)
      .single();
    if (colErr || !col) return NextResponse.json({ ok: false, error: "Collection not found" }, { status: 404 });

    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return NextResponse.json({ ok: false, error: "No rows found" }, { status: 400 });

    const MAX_ROWS = 5000;
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ ok: false, error: `Too many rows (>${MAX_ROWS})` }, { status: 400 });
    }

    // Replace contents
    const del = await supabase.from("collection_cards").delete().eq("collection_id", collection_id);
    if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 200 });

    // Chunk insert
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
        return NextResponse.json({ ok: false, error: insErr.message, inserted }, { status: 200 });
      }
      inserted += count ?? chunk.length;
    }

    return NextResponse.json({ ok: true, inserted }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "Unexpected error" }, { status: 500 });
  }
}
