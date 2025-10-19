import { NextRequest, NextResponse } from "next/server";
import { combosFor } from "@/lib/combos";

export const runtime = 'edge';
export const revalidate = 86400; // 24 hours

export async function GET(req: NextRequest) {
  try {
    const commander = String(req.nextUrl.searchParams.get("commander") || "");
    const archetype = String(req.nextUrl.searchParams.get("archetype") || "");
    const list = combosFor({ commander, archetype }, 3);
    return NextResponse.json({ ok: true, combos: list }, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800'
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "combos failed" }, { status: 500 });
  }
}