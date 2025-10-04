import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

const DAY = 24 * 60 * 60 * 1000;

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { names } = body;

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: "Invalid names array" }, { status: 400 });
    }

    const cacheKey = `batch-images:${names.sort().join(",")}`;
    const cached = memoGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    // Use our scryfall cache instead of making live API calls
    const imageMap = await getImagesForNamesCached(names.map((name: string) => name.trim()));
    
    // Transform cached data to Scryfall API format for compatibility
    const data: any[] = [];
    const not_found: any[] = [];
    
    for (const name of names) {
      const cleanName = name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
      const imageInfo = imageMap.get(cleanName);
      
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
