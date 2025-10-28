import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const frontFace = searchParams.get('frontFace');
    
    if (!frontFace) {
      return NextResponse.json({ ok: false, error: 'frontFace parameter required' }, { status: 400 });
    }
    
    const norm = (s: string) => String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    const supabase = await createClient();
    
    // Query all DFCs with this front face
    const { data: dfcMatches } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', `${frontFace} //%`)
      .limit(20);
    
    if (!dfcMatches || dfcMatches.length === 0) {
      return NextResponse.json({ ok: true, variants: [] });
    }
    
    const frontNorm = norm(frontFace);
    
    // Filter to only valid DFCs (front ≠ back, matching front face)
    const validDFCs = dfcMatches.filter((r: any) => {
      const parts = r.name.split('//').map((p: string) => p.trim());
      const cacheFrontNorm = norm(parts[0]);
      const cacheBackNorm = norm(parts[1] || '');
      return cacheFrontNorm === frontNorm && cacheFrontNorm !== cacheBackNorm;
    });
    
    return NextResponse.json({ 
      ok: true, 
      variants: validDFCs.map((r: any) => r.name)
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

