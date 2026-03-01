import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";

export const runtime = "nodejs";

function norm(s: string) { 
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[''`´]/g, "'").trim(); 
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.slice(0, 50) : [];
    if (!names.length) return NextResponse.json({ ok:false, error:'names required' }, { status:400 });

    const supabase = await createClient();
    const results: Record<string, { suggestion?: string; all?: string[] }> = {};

    for (const raw of names) {
      const q = String(raw||'').trim();
      // Clean the card name using comprehensive utility
      const q0 = cleanCardName(q);
      const qn = norm(q0);
      let all: string[] = [];

      // 1) Database search: try multiple strategies
      try {
        // Strategy 1a: Exact case-insensitive match
        const { data: exactData } = await supabase
          .from('scryfall_cache')
          .select('name')
          .ilike('name', q0)
          .limit(1);
        
        if (exactData && exactData.length > 0) {
          all = [exactData[0].name];
        }
        
        // Strategy 1b: Contains match (if no exact match)
        if (all.length === 0) {
          const escaped = q0.replace(/[%_]/g, '\\$&');
          const { data: containsData } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `%${escaped}%`)
            .limit(12);
          
          if (containsData && containsData.length > 0) {
            // Sort by similarity and whether it starts with the query
            const sorted = containsData
              .map(r => ({
                name: r.name,
                score: stringSimilarity(qn, norm(r.name)),
                startsWith: norm(r.name).startsWith(qn)
              }))
              .sort((a, b) => {
                // Prefer startsWith matches
                if (a.startsWith && !b.startsWith) return -1;
                if (!a.startsWith && b.startsWith) return 1;
                return b.score - a.score;
              });
            
            all = sorted.slice(0, 12).map(r => r.name);
          }
        }
        
        // Strategy 1c: Prefix match (if still nothing)
        if (all.length === 0 && q0.length >= 3) {
          const escaped = q0.replace(/[%_]/g, '\\$&');
          const { data: prefixData } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `${escaped}%`)
            .limit(12);
          
          if (prefixData && prefixData.length > 0) {
            all = prefixData.map(r => r.name);
          }
        }
        
        // Strategy 1d: DFC front-face match
        if (all.length === 0) {
          const escaped = q0.replace(/[%_]/g, '\\$&');
          const { data: dfcData } = await supabase
            .from('scryfall_cache')
            .select('name')
            .ilike('name', `${escaped} // %`)
            .limit(5);
          
          if (dfcData && dfcData.length > 0) {
            all = dfcData.map(r => r.name);
          }
        }
      } catch {}

      // 2) If still empty, use Scryfall autocomplete
      if (all.length === 0) {
        try {
          const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q0)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const arr = Array.isArray(j?.data) ? j.data : [];
          all = arr.slice(0, 12).map((s:any)=>String(s));
        } catch {}
      }

      // 3) If still empty, try Scryfall named?fuzzy
      if (all.length === 0) {
        try {
          const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q0)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const n = String(j?.name || '').trim();
          if (n) all = [n];
        } catch {}
      }

      // 4) If still empty, try with first few words
      if (all.length === 0 && q0.includes(' ')) {
        const words = q0.split(/\s+/);
        const firstWords = words.slice(0, Math.min(2, words.length)).join(' ');
        try {
          const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(firstWords)}`, { cache: 'no-store' });
          const j:any = await r.json().catch(()=>({}));
          const arr = Array.isArray(j?.data) ? j.data : [];
          // Filter to only include results that are reasonably similar
          const filtered = arr.filter((s: string) => stringSimilarity(q0, s) > 0.3);
          all = filtered.slice(0, 12).map((s:any)=>String(s));
        } catch {}
      }
      
      // 5) Last resort: try first word only
      if (all.length === 0) {
        const firstWord = q0.split(/\s+/)[0];
        if (firstWord && firstWord.length >= 3) {
          try {
            const r = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(firstWord)}`, { cache: 'no-store' });
            const j:any = await r.json().catch(()=>({}));
            const arr = Array.isArray(j?.data) ? j.data : [];
            // Only include if somewhat similar to original
            const filtered = arr.filter((s: string) => stringSimilarity(q0, s) > 0.25);
            all = filtered.slice(0, 12).map((s:any)=>String(s));
          } catch {}
        }
      }

      const suggestion = all[0];
      results[q] = { suggestion, all };
    }

    return NextResponse.json({ ok:true, results });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
