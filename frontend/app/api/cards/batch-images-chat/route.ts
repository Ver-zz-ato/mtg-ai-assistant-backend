// frontend/app/api/cards/batch-images-chat/route.ts
// Batch fetch card images from internal scryfall_cache for chat feature
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { names } = await req.json();
    
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ ok: true, images: {} });
    }

    const supabase = await getSupabaseServer();
    
    // Normalize names for lookup (lowercase, remove accents, normalize spaces)
    const normalizedNames = names.map((name: string) => 
      String(name || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    );

    // Query scryfall_cache for all names at once (name column is already normalized)
    const { data: cards, error } = await supabase
      .from("scryfall_cache")
      .select("name, image_uris")
      .in("name", normalizedNames)
      .limit(100);

    if (error) {
      console.error("[batch-images-chat] Database error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Build result map: normalized name -> { small, normal, art_crop }
    const images: Record<string, { small?: string; normal?: string; art_crop?: string }> = {};
    
    for (const card of cards || []) {
      const normalized = String(card.name || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      
      const imageUris = card.image_uris || {};
      images[normalized] = {
        small: imageUris.small,
        normal: imageUris.normal,
        art_crop: imageUris.art_crop
      };
    }

    return NextResponse.json({ ok: true, images });
  } catch (err: any) {
    console.error("[batch-images-chat] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

