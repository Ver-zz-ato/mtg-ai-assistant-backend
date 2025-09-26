
import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const qp = Object.fromEntries(req.nextUrl.searchParams.entries());
  return NextResponse.json({ ok: true, method: "GET", query: qp, headers: Object.fromEntries(req.headers) });
}
export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  let parsed: any = null; let raw: string | null = null;
  if (ct.includes("application/json")) {
    try { parsed = await req.json(); } catch { parsed = null; }
  }
  if (parsed === null) {
    try { raw = await req.text(); } catch { raw = null; }
    try { if (raw && raw.trim().startsWith("{")) parsed = JSON.parse(raw); } catch {}
  }
  return NextResponse.json({ ok: true, method: "POST", headers: Object.fromEntries(req.headers), body: { ct, parsed, raw } });
}
