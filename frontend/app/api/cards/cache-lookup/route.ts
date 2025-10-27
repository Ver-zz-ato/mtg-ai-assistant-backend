import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const name = searchParams.get('name');
    
    if (!name) {
      return NextResponse.json({ ok: false, error: 'name parameter required' }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // Try exact case-insensitive match first
    const { data: exactMatch } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', name)
      .limit(1);
    
    if (exactMatch && exactMatch.length > 0) {
      return NextResponse.json({ ok: true, name: exactMatch[0].name });
    }
    
    // For double-faced cards, try front face match
    if (name.includes('//')) {
      const frontFace = name.split('//')[0].trim();
      const { data: dfcMatch } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${frontFace}%`)
        .limit(5);
      
      if (dfcMatch && dfcMatch.length > 0) {
        // Prefer full DFC name format
        const fullDFC = dfcMatch.find((r: any) => r.name.includes('//'));
        if (fullDFC) {
          return NextResponse.json({ ok: true, name: fullDFC.name });
        }
      }
    }
    
    return NextResponse.json({ ok: false, error: 'Card not found in cache' }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}


