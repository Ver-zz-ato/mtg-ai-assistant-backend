import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const deckId = sp.get('deckId');
    if (!deckId) return NextResponse.json({ ok:false, error:'deckId required' }, { status:400 });

    const supabase = await createClient();
    const { data: rows } = await supabase
      .from('deck_cards')
      .select('id, name')
      .eq('deck_id', deckId)
      .limit(1000);
    const cards = Array.isArray(rows) ? rows as any[] : [];

    // Find names not present in scryfall_cache
    const names = Array.from(new Set(cards.map(r=>r.name)));
    // Case-insensitive match against cache using OR of ilike clauses (up to 50)
    const slice = names.slice(0, 50);
    const or = slice.map(n => `name.ilike.${encodeURIComponent(n)}`).join(',');
    const { data: known } = await supabase
      .from('scryfall_cache')
      .select('name')
      .or(or);
    const knownSetNorm = new Set<string>((known||[]).map((r:any)=>norm(String(r.name))));

    const unknown = cards.filter(r => !knownSetNorm.has(norm(r.name)));
    if (unknown.length === 0) return NextResponse.json({ ok:true, items: [] });

    // Ask fuzzy endpoint for suggestions in batch (limit to 50 distinct names)
    const uniq = Array.from(new Set(unknown.map(r=>r.name))).slice(0,50);
    // Call fuzzy handler directly to avoid network TLS/proxy issues
    try {
      const { POST: fuzzy } = await import("@/app/api/cards/fuzzy/route");
      const fuzzyReq = new (await import('next/server')).NextRequest(new URL('/api/cards/fuzzy', req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' } as any,
        body: JSON.stringify({ names: uniq }),
      } as any);
      const fuzzyRes = await fuzzy(fuzzyReq);
      const j:any = await fuzzyRes.json().catch(()=>({}));
      const map = j?.results || {};

      const items = unknown.map(r => {
        const all: string[] = Array.isArray(map[r.name]?.all) ? map[r.name].all : [];
        // If best suggestion equals original ignoring case/diacritics, skip the entry
        if (all.length && norm(all[0]) === norm(r.name)) return null as any;
        return { id: r.id, name: r.name, suggestions: all };
      }).filter(Boolean);
      return NextResponse.json({ ok:true, items });
    } catch (e:any) {
      return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
    }
    const map = j?.results || {};

    const items = unknown.map(r => {
      const all: string[] = Array.isArray(map[r.name]?.all) ? map[r.name].all : [];
      // If best suggestion equals original ignoring case/diacritics, skip the entry
      if (all.length && norm(all[0]) === norm(r.name)) return null as any;
      return { id: r.id, name: r.name, suggestions: all };
    }).filter(Boolean);
    return NextResponse.json({ ok:true, items });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
