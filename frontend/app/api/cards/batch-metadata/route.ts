import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";
import { createClient } from "@/lib/supabase/server";

const DAY = 24 * 60 * 60 * 1000;

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { names } = body;

    if (!names || !Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: "Invalid names array" }, { status: 400 });
    }

    const cacheKey = `batch-metadata:${names.sort().join(",")}`;
    const cached = memoGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const supabase = await createClient();
    const uniq = Array.from(new Set(names.map((n: string) => n.trim()).filter(Boolean)));
    const keys = uniq.map(norm);
    
    console.log('[batch-metadata] Querying for', keys.length, 'unique cards');
    console.log('[batch-metadata] First 3 keys:', keys.slice(0, 3));

    // Fetch metadata from our scryfall_cache table
    const { data: rows, error } = await supabase
      .from("scryfall_cache")
      .select("name, type_line, oracle_text, color_identity, rarity, set, small, normal, art_crop")
      .in("name", keys);
    
    console.log('[batch-metadata] Query returned', rows?.length || 0, 'rows');
    if (error) console.error('[batch-metadata] Query error:', error);
    if (rows && rows.length > 0) {
      console.log('[batch-metadata] First 3 rows:', rows.slice(0, 3));
      console.log('[batch-metadata] First row raw data:', JSON.stringify(rows[0], null, 2));
      console.log('[batch-metadata] Checking rarity field:', rows[0]?.rarity, 'type:', typeof rows[0]?.rarity);
    }

    const rowsArray = (rows || []) as any[];
    const dataMap = new Map();
    
    for (const row of rowsArray) {
      dataMap.set(row.name, {
        set: String(row.set || '').toUpperCase(),
        rarity: row.rarity ? String(row.rarity).toLowerCase() : null, // Keep null if missing
        type_line: String(row.type_line || ''),
        oracle_text: String(row.oracle_text || ''),
        color_identity: Array.isArray(row.color_identity) ? row.color_identity : [],
        image_uris: {
          small: row.small || undefined,
          normal: row.normal || undefined,
          art_crop: row.art_crop || undefined
        }
      });
    }

    // Format response for client
    const data: any[] = [];
    const not_found: any[] = [];
    
    for (const name of names) {
      const normalizedKey = norm(name.trim());
      const metadata = dataMap.get(normalizedKey);
      
      if (metadata) {
        data.push({
          name: name.trim(),
          ...metadata
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
    console.error('Batch metadata API error:', error);
    return NextResponse.json(
      { error: "Failed to fetch card metadata" }, 
      { status: 500 }
    );
  }
});

