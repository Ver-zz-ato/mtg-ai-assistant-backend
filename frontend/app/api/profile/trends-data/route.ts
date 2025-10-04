import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCardDataForProfileTrends } from "@/lib/server/scryfallCache";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { cardNames } = body;
    
    if (!Array.isArray(cardNames)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Get cached card data
    const cardData = await getCardDataForProfileTrends(cardNames);
    
    // Convert Map to object for JSON serialization, using original names as keys for easier lookup
    const result: Record<string, any> = {};
    
    // Create a map from normalized name back to original names
    const norm = (name: string) => String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const originals = new Map<string, string>();
    for (const original of cardNames) {
      const normalized = norm(original);
      if (!originals.has(normalized)) {
        originals.set(normalized, original);
      }
    }
    
    // Return data keyed by both original and normalized names for compatibility
    for (const [normalizedKey, value] of cardData.entries()) {
      const originalKey = originals.get(normalizedKey) || normalizedKey;
      result[originalKey] = value; // Original name as key
      result[normalizedKey] = value; // Normalized name as key (for backward compatibility)
    }

    // Debug logging to track what's happening
    console.log(`Profile trends-data: Requested ${cardNames.length} cards, got ${cardData.size} results`);

    return NextResponse.json({ ok: true, cardData: result });
  } catch (error: any) {
    console.error('Profile trends data error:', error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch trends data" },
      { status: 500 }
    );
  }
}