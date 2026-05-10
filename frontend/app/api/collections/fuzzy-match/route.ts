// app/api/collections/fuzzy-match/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCardNamesForImport } from "@/lib/server/cardNameResolution";

export const dynamic = "force-dynamic";

/**
 * Fuzzy match card names against scryfall_cache first (accurate, fast), then Scryfall API fallback.
 * Same matching strategy as /api/cards/fuzzy and deck fix-names.
 */
export async function POST(req: Request) {
  try {
    const { names } = await req.json();

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ ok: false, error: "names array required" }, { status: 400 });
    }

    const supabase = await createClient();
    const results = await resolveCardNamesForImport(supabase, names, 1000);

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("collections/fuzzy-match error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "fuzzy-match error" },
      { status: 500 }
    );
  }
}
