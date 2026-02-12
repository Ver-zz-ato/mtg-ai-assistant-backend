import { NextRequest, NextResponse } from "next/server";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/commander-art?name=Atraxa,%20Praetors%27%20Voice
 * Returns { ok: true, art: string } or { ok: false }
 * Public endpoint - used for commander hover previews and SSR fallbacks.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const name = url.searchParams.get("name")?.trim();
    if (!name || name.length > 120) {
      return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
    }
    const safeName = name.replace(/[\x00-\x1F\x7F]/g, "").trim();
    const clean = safeName.replace(/\s*\(.*?\)\s*$/, "").trim();
    const imgMap = await getImagesForNamesCached([clean]);
    const img = imgMap.get(norm(clean));
    const art = img?.art_crop || img?.normal || img?.small || null;
    return NextResponse.json(
      { ok: !!art, art },
      {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json({ ok: false, art: null }, { status: 500, headers: NO_STORE });
  }
}
