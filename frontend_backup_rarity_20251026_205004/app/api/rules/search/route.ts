import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const q = String(req.nextUrl.searchParams.get("q") || "").toLowerCase();
    const res = await fetch(new URL("/rules/index.json", req.url), { cache: "force-cache" });
    const index: any[] = await res.json().catch(() => []);
    const hits = index
      .filter((r) => !q || (String(r.text || "").toLowerCase().includes(q) || String(r.rule || "").toLowerCase().includes(q)))
      .slice(0, 8);
    return NextResponse.json({ ok: true, results: hits });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "rules search failed" }, { status: 500 });
  }
}