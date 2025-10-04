import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { withLogging } from "@/lib/api/withLogging";

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

    // Format for Scryfall collection API
    const identifiers = names.map((name: string) => ({ name: name.trim() }));
    
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers })
    });

    if (!response.ok) {
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform to expected format
    const result = {
      data: data.data || [],
      not_found: data.not_found || []
    };

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