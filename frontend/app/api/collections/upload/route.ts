// frontend/app/api/collections/upload/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseCSV(text: string): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return out;

  const headerCols = lines[0].toLowerCase().split(",").map(h => h.trim());
  const looksLikeHeader =
    headerCols.length >= 2 &&
    (headerCols.includes("name") || headerCols.includes("card") || headerCols.includes("card name"));

  let start = looksLikeHeader ? 1 : 0;
  let nameIdx = 0, qtyIdx = 1;
  if (looksLikeHeader) {
    const n = headerCols.findIndex(h => ["name","card","card name"].includes(h));
    const q = headerCols.findIndex(h => ["qty","quantity","count","owned"].includes(h));
    nameIdx = n === -1 ? 0 : n;
    qtyIdx = q === -1 ? 1 : q;
  }

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    if (!cols.length) continue;

    let name = "";
    let qty = 0;

    if (looksLikeHeader) {
      name = cols[nameIdx] ?? "";
      qty = Number(cols[qtyIdx] ?? "0");
    } else {
      const a = cols[0] ?? "", b = cols[1] ?? "";
      if (/^\d+$/.test(a)) { qty = Number(a); name = b; }
      else if (/^\d+$/.test(b)) { name = a; qty = Number(b); }
      else { name = a; qty = 1; }
    }

    name = name.trim();
    if (!name) continue;
    if (!Number.isFinite(qty) || qty < 0) qty = 0;
    out.push({ name, qty });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const collection_id = (form.get("collection_id") as string | null)?.trim();
    const file = form.get("file") as File | null;

    if (!collection_id) return NextResponse.json({ error: "Missing collection_id" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    // RLS will enforce ownership; this select doubles as existence check
    const { data: col, error: colErr } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collection_id)
      .single();
    if (colErr || !col) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return NextResponse.json({ error: "No rows found in CSV" }, { status: 400 });

    // Replace existing entries for the collection
    const del = await supabase.from("collection_cards").delete().eq("collection_id", collection_id);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    const payload = rows.map(r => ({ collection_id, name: r.name, qty: r.qty }));
    const { error: insErr } = await supabase.from("collection_cards").insert(payload);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, inserted: payload.length }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
