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
    // Note: small, normal, art_crop are separate columns, not nested in image_uris
    const { data: cards, error } = await supabase
      .from("scryfall_cache")
      .select("name, small, normal, art_crop")
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
      
      images[normalized] = {
        small: card.small || undefined,
        normal: card.normal || undefined,
        art_crop: card.art_crop || undefined
      };
    }

    return NextResponse.json({ ok: true, images });
  } catch (err: any) {
    console.error("[batch-images-chat] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

