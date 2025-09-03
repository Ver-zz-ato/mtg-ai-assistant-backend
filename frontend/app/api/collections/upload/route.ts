import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, route: "collections/upload" }, { status: 200 });
}

// Tiny CSV parser
function parseCSV(text: string): Array<{ name: string; qty: number }> {
  const rows: Array<{ name: string; qty: number }> = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return rows;

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
    const name = cols[nameIdx] ?? "";
    let qty = Number(cols[qtyIdx] ?? "1");
    if (!name) continue;
    if (!Number.isFinite(qty) || qty < 0) qty = 1;
    rows.push({ name, qty });
  }
  return rows;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const collection_id = (form.get("collection_id") as string | null)?.trim();
  const file = form.get("file") as File | null;

  if (!collection_id) return NextResponse.json({ error: "Missing collection_id" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);

  return NextResponse.json({
    ok: true,
    collection_id,
    file_name: file.name,
    parsed_rows: rows.length
  }, { status: 200 });
}
