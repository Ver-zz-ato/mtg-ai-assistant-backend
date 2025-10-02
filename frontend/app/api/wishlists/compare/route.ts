import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest){
  try{
    const url = new URL(req.url);
    const collectionId = url.searchParams.get('collectionId')||'';
    const wishlistId = url.searchParams.get('wishlistId')||'';
    const currency = (url.searchParams.get('currency')||'USD').toUpperCase();
    const supabase = await getServerSupabase();
    // get wishlist
    const { data: items } = await (supabase as any)
      .from('wishlist_items').select('name,qty').eq('wishlist_id', wishlistId);
    const { data: col } = await (supabase as any)
      .from('collection_cards').select('name,qty').eq('collection_id', collectionId);
    const have = new Map<string, number>((col||[]).map((r:any)=>[String(r.name).toLowerCase(), Number(r.qty||0)]));
    const missing: Array<{ name:string; need:number; unit:number }> = [];
    const names = Array.from(new Set((items||[]).map((i:any)=>i.name)));
    if(names.length){
      const r = await fetch(''+new URL('/api/price/snapshot', url as any), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }) });
      const j = await r.json().catch(()=>({}));
      const prices: Record<string, number> = j?.prices||{}; const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      for(const it of (items||[])){
        const haveQty = have.get(String(it.name).toLowerCase())||0;
        const need = Math.max(0, Number(it.qty||0) - haveQty);
        if(need>0) missing.push({ name: it.name, need, unit: prices[norm(it.name)]||0 });
      }
    }
    const total = missing.reduce((s,m)=> s + m.need*m.unit, 0);
    return NextResponse.json({ ok:true, missing, total, currency });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}