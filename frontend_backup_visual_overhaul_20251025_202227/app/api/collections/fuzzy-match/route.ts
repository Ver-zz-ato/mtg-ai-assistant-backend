// app/api/collections/fuzzy-match/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fuzzy match card names using Scryfall API
 * Accepts array of card names and returns match results
 */
export async function POST(req: Request) {
  try {
    const { names } = await req.json();
    
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ ok: false, error: "names array required" }, { status: 400 });
    }

    // Limit to 100 cards per request to avoid timeout
    const limitedNames = names.slice(0, 100);
    
    const results = await Promise.all(
      limitedNames.map(async (name: string) => {
        try {
          // Try exact match first
          const exactUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
          const exactRes = await fetch(exactUrl);
          
          if (exactRes.ok) {
            const data = await exactRes.json();
            return {
              originalName: name,
              matchStatus: 'exact' as const,
              suggestedName: data.name,
              confidence: 100,
              scryfallData: {
                name: data.name,
                set: data.set_name,
                image_uri: data.image_uris?.small || data.image_uris?.normal,
              }
            };
          }

          // Try fuzzy match
          const fuzzyUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
          const fuzzyRes = await fetch(fuzzyUrl);
          
          if (fuzzyRes.ok) {
            const data = await fuzzyRes.json();
            // Calculate simple confidence based on name similarity
            const confidence = calculateSimilarity(name.toLowerCase(), data.name.toLowerCase());
            
            return {
              originalName: name,
              matchStatus: confidence > 90 ? 'exact' : 'fuzzy' as const,
              suggestedName: data.name,
              confidence,
              scryfallData: {
                name: data.name,
                set: data.set_name,
                image_uri: data.image_uris?.small || data.image_uris?.normal,
              }
            };
          }

          // Not found
          return {
            originalName: name,
            matchStatus: 'notfound' as const,
            confidence: 0,
          };
        } catch (error) {
          console.error(`Error matching card "${name}":`, error);
          return {
            originalName: name,
            matchStatus: 'notfound' as const,
            confidence: 0,
          };
        }
      })
    );

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("fuzzy-match error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "fuzzy-match error" }, { status: 500 });
  }
}

/**
 * Simple string similarity calculation (Levenshtein-ish)
 * Returns percentage 0-100
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 100;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

