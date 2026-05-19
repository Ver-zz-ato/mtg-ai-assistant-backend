import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { createClient } from "@/lib/supabase/server";
import { resolveCardNamesForImport } from "@/lib/server/cardNameResolution";
import { sanitizeImageCacheInputName, normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

const DAY = 24 * 60 * 60 * 1000;

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { names } = body;

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: "Invalid names array" }, { status: 400 });
    }

    const cacheKey = `batch-images:v2:${[...names].map((name: string) => String(name).trim()).sort().join(",")}`;
    const cached = memoGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    // Use our scryfall cache instead of making live API calls
    const imageMap = await getImagesForNamesCached(names.map((name: string) => String(name).trim()));
    const unresolvedNames: string[] = [];

    for (const name of names) {
      const trimmed = String(name).trim();
      const sanitized = sanitizeImageCacheInputName(trimmed);
      const cleanName = sanitized != null ? normalizeScryfallCacheName(sanitized) : "";
      if (!cleanName) continue;
      const imageInfo = imageMap.get(cleanName);
      if (!imageInfo || (!imageInfo.small && !imageInfo.normal && !imageInfo.art_crop)) {
        unresolvedNames.push(trimmed);
      }
    }

    const resolvedLookupByOriginal = new Map<string, string>();
    let resolvedImageMap = new Map<string, { small?: string; normal?: string; art_crop?: string }>();

    if (unresolvedNames.length > 0) {
      const supabase = await createClient();
      const resolved = await resolveCardNamesForImport(supabase, unresolvedNames, unresolvedNames.length);
      const resolvedNamesToFetch = [...new Set(
        resolved
          .map((item) => {
            const resolvedName = item.suggestedName || item.scryfallData?.name || "";
            if (resolvedName) resolvedLookupByOriginal.set(item.originalName, normalizeScryfallCacheName(resolvedName));
            return resolvedName;
          })
          .filter(Boolean)
      )];

      if (resolvedNamesToFetch.length > 0) {
        resolvedImageMap = await getImagesForNamesCached(resolvedNamesToFetch);
      }
    }
    
    // Transform cached data to Scryfall API format for compatibility
    const data: any[] = [];
    const not_found: any[] = [];
    
    for (const name of names) {
      const trimmed = String(name).trim();
      const sanitized = sanitizeImageCacheInputName(trimmed);
      const cleanName = sanitized != null ? normalizeScryfallCacheName(sanitized) : "";
      const resolvedKey = resolvedLookupByOriginal.get(trimmed);
      const imageInfo =
        (cleanName ? imageMap.get(cleanName) : undefined) ||
        (resolvedKey ? resolvedImageMap.get(resolvedKey) : undefined);
      
      if (imageInfo && (imageInfo.small || imageInfo.normal || imageInfo.art_crop)) {
        // Format as Scryfall card object
        data.push({
          name: name.trim(),
          image_uris: {
            small: imageInfo.small,
            normal: imageInfo.normal,
            art_crop: imageInfo.art_crop
          }
        });
      } else {
        not_found.push({ name: name.trim() });
      }
    }
    
    const result = { data, not_found };

    // Cache for 1 day
    memoSet(cacheKey, result, DAY);
    
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Batch images API error:', error);
    return NextResponse.json(
      { error: "Failed to fetch card images" }, 
      { status: 500 }
    );
  }
});
