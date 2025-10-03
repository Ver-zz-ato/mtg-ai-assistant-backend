import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

function norm(s: string){ return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

export async function GET(req: NextRequest){
  try{
    const url = new URL(req.url);
    const wishlistId = String(url.searchParams.get('wishlistId')||'');
    if (!wishlistId) return NextResponse.json({ ok:false, error:'wishlistId required' }, { status:400 });
    const supabase = await getServerSupabase();
    const { data: rows } = await (supabase as any).from('wishlist_items').select('name').eq('wishlist_id', wishlistId).limit(1000);
    const items: string[] = Array.isArray(rows)? (rows as any[]).map(r=>String(r.name||'')) : [];
    if (!items.length) return NextResponse.json({ ok:true, items: [] });

    // Known names from scryfall_cache (case/diacritics-insensitive)
    const slice = Array.from(new Set(items)).slice(0, 50);
    const or = slice.map(n => `name.ilike.${encodeURIComponent(n)}`).join(',');
    const { data: known } = await (supabase as any).from('scryfall_cache').select('name').or(or);
    const knownSet = new Set<string>((known||[]).map((r:any)=>norm(String(r.name||''))));
    const unknown = Array.from(new Set(items.filter(n => !knownSet.has(norm(n)))));
    if (unknown.length === 0) return NextResponse.json({ ok:true, items: [] });

    // Ask fuzzy endpoint for suggestions by calling handler directly (avoid self-fetch TLS issues)
    try {
      const { POST: fuzzy } = await import("@/app/api/cards/fuzzy/route");
      const fuzzyReq = new (await import('next/server')).NextRequest(new URL('/api/cards/fuzzy', req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' } as any,
        body: JSON.stringify({ names: unknown.slice(0,50) }),
      } as any);
      const fuzzyRes = await fuzzy(fuzzyReq);
      const jf:any = await fuzzyRes.json().catch(()=>({}));
      const map = jf?.results || {};
      const out = unknown.map(n => ({ name: n, suggestions: (map[n]?.all||[]).filter(Boolean) }));
      return NextResponse.json({ ok:true, items: out });
    } catch (e:any) {
      return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
    }
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}
