import { NextRequest, NextResponse } from "next/server";
import { combosFor } from "@/lib/combos";

export async function GET(req: NextRequest) {
  try {
    const commander = String(req.nextUrl.searchParams.get("commander") || "");
    const archetype = String(req.nextUrl.searchParams.get("archetype") || "");
    const list = combosFor({ commander, archetype }, 3);
    return NextResponse.json({ ok: true, combos: list });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "combos failed" }, { status: 500 });
  }
}