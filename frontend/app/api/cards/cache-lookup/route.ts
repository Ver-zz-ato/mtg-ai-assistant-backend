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
    
    const norm = (s: string) => String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    
    // Try exact case-insensitive match first
    const { data: exactMatch } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', name)
      .limit(1);
    
    if (exactMatch && exactMatch.length > 0) {
      return NextResponse.json({ ok: true, name: exactMatch[0].name });
    }
    
    // For double-faced cards, search by front face and return the correct full name
    if (name.includes('//')) {
      const frontFace = name.split('//')[0].trim();
      const { data: dfcMatches } = await supabase
        .from('scryfall_cache')
        .select('name')
        .ilike('name', `${frontFace} //%`) // Must be a DFC starting with front face
        .limit(10);
      
      if (dfcMatches && dfcMatches.length > 0) {
        const frontNorm = norm(frontFace);
        
        // Filter to only valid DFCs (where front ≠ back)
        const validDFCs = dfcMatches.filter((r: any) => {
          const parts = r.name.split('//').map((p: string) => p.trim());
          const cacheFrontNorm = norm(parts[0]);
          const cacheBackNorm = norm(parts[1] || '');
          return cacheFrontNorm === frontNorm && cacheFrontNorm !== cacheBackNorm;
        });
        
        // Return first valid DFC
        if (validDFCs.length > 0) {
          return NextResponse.json({ ok: true, name: validDFCs[0].name });
        }
        
        // Fallback: return any DFC if no valid one found (shouldn't happen)
        const anyDFC = dfcMatches.find((r: any) => r.name.includes('//'));
        if (anyDFC) {
          return NextResponse.json({ ok: true, name: anyDFC.name });
        }
      }
    }
    
    return NextResponse.json({ ok: false, error: 'Card not found in cache' }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}


