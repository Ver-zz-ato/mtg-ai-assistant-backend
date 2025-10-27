import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Server route that mirrors the public-profile banner art logic.
// Params (optional): signatureDeckId, favCommander
export async function GET(req: NextRequest){
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });

    const url = new URL(req.url);
    const signatureDeckId = url.searchParams.get('signatureDeckId') || '';
    const favCommander = url.searchParams.get('favCommander') || '';

    async function scryfallBatch(names: string[]): Promise<Map<string,{art_crop?:string; normal?:string; small?:string}>>{
      const out = new Map<string,{art_crop?:string; normal?:string; small?:string}>();
      const uniq = Array.from(new Set(names.filter(Boolean))).slice(0, 400);
      if (!uniq.length) return out;
      const body = { identifiers: uniq.map(n=>({ name: n })) } as any;
      try{
        const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
        const j:any = await r.json().catch(()=>({}));
        const rows:any[] = Array.isArray(j?.data)? j.data : [];
        for (const c of rows){ const img=c?.image_uris||c?.card_faces?.[0]?.image_uris||{}; out.set(String(c?.name||'').toLowerCase(), { art_crop: img.art_crop, normal: img.normal, small: img.small }); }
      } catch{}
      return out;
    }

    function norm(s:string){ return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

    async function getDeckArt(deckId: string){
      try{
        const { data } = await sb.from('decks').select('title, commander, deck_text').eq('id', deckId).maybeSingle();
        const list: string[] = [];
        const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim();
        if (data?.commander) list.push(clean(String(data.commander)));
        if (data?.title) list.push(clean(String(data.title)));
        const lines = String(data?.deck_text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).slice(0,5);
        for (const line of lines){ const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/); list.push(clean(m ? (m as any)[2] : line)); }
        try{
          const { data: top } = await sb.from('deck_cards').select('name, qty').eq('deck_id', deckId).order('qty', { ascending: false }).limit(5);
          for (const r of (top as any[])||[]) list.push(clean(String(r.name)));
        } catch{}
        const imgMap = await scryfallBatch(list);
        for (const n of list){ const img = imgMap.get(norm(n)); if (img?.art_crop || img?.normal || img?.small) return img.art_crop || img.normal || img.small; }
        for (const n of Array.from(new Set(list)).slice(0,20)){
          try{ const fr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(n)}`, { cache:'no-store' }); if (!fr.ok) continue; const c:any = await fr.json().catch(()=>({})); const img=c?.image_uris||c?.card_faces?.[0]?.image_uris||{}; const url = img.art_crop||img.normal||img.small; if (url) return url; } catch{}
        }
      } catch{}
      return undefined;
    }

    // Try: signature deck -> fav commander -> any art inferred from recent public decks
    let art: string | undefined;
    const sid = String(signatureDeckId||'').trim();
    if (sid) art = await getDeckArt(sid);

    if (!art && favCommander){
      try{ const fr = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(favCommander)}`, { cache:'no-store' }); const c:any = await fr.json().catch(()=>({})); const img=c?.image_uris||c?.card_faces?.[0]?.image_uris||{}; art = img.art_crop||img.normal||img.small; } catch{}
    }

    if (!art){
      try{
        const { data } = await sb.from('decks').select('id').eq('user_id', user.id).order('updated_at', { ascending:false }).limit(1);
        const first = Array.isArray(data)&&data[0]?.id ? String(data[0].id) : '';
        if (first) art = await getDeckArt(first);
      } catch{}
    }

    return NextResponse.json({ ok:true, art: art||null });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'server_error' }, { status:500 }); }
}
