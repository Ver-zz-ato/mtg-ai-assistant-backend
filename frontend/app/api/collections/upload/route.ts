// app/api/collections/upload/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // be explicit

// Quick ping so we can verify the route exists with GET
export async function GET() {
  return NextResponse.json({ ok: true, route: "collections/upload" }, { status: 200 });
}

// --- minimal CSV parser ---
function parseCSV(text: string): Array<{ name: string; qty: number }> {
  const rows: Array<{ name: string; qty: number }> = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return rows;

  const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
  const hasHeader = headers.some(h => ["name","card","qty","quantity","count","owned"].includes(h));

  let start = hasHeader ? 1 : 0;
  let nameIdx = 0, qtyIdx = 1;
  if (hasHeader) {
    const n = headers.findIndex(h => ["name","card"].includes(h));
    const q = headers.findIndex(h => ["qty","quantity","count","owned"].includes(h));
    if (n >= 0) nameIdx = n;
    if (q >= 0) qtyIdx = q;
  }

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim());
    if (!cols.length) continue;
    let name = cols[nameIdx] ?? "";
    let qty = Number(cols[qtyIdx] ?? "1");
    if (!name) continue;
    if (!Number.isFinite(qty) || qty < 0) qty = 1;
    rows.push({ name, qty });
  }
  return rows;
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

    // Ownership check (RLS also enforces)
    const { data: col, error: colErr } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collection_id)
      .single();
    if (colErr || !col) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return NextResponse.json({ error: "No rows found" }, { status: 400 });

    // Replace the collection’s rows
    const del = await supabase.from("collection_cards").delete().eq("collection_id", collection_id);
    if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

    const payload = rows.map(r => ({ collection_id, name: r.name, qty: r.qty }));
    const { error: insErr } = await supabase.from("collection_cards").insert(payload);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, inserted: payload.length }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unexpected error" }, { status: 500 });
  }
}
