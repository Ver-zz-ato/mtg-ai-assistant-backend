import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

function norm(s: string){
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

export async function GET(req: NextRequest){
  try{
    const url = new URL(req.url);
    const wishlistId = String(url.searchParams.get('wishlistId')||'');
    const currency = (url.searchParams.get('currency')||'USD').toUpperCase();
    if (!wishlistId) return NextResponse.json({ ok:false, error:'wishlistId required' }, { status:400 });

    const supabase = await getServerSupabase();
    // Fetch items
    const { data: items, error: itErr } = await (supabase as any)
      .from('wishlist_items')
      .select('name, qty')
      .eq('wishlist_id', wishlistId)
      .order('name', { ascending: true });
    if (itErr) return NextResponse.json({ ok:false, error: itErr.message }, { status:500 });

    const names = Array.from(new Set((items||[]).map((r:any)=>String(r.name||'')).filter(Boolean)));

    // Price enrichment via existing snapshot API - use cache: no-store to ensure fresh data
    let prices: Record<string, number> = {};
    if (names.length){
      try{
        const pr = await fetch(''+new URL('/api/price/snapshot', url as any), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }), cache: 'no-store' });
        const pj = await pr.json().catch(()=>({}));
        prices = pj?.prices || {};
      } catch {}
    }

    // Thumbnails via Scryfall collection batch
    let thumbs: Record<string,string> = {};
    if (names.length){
      try{
        const identifiers = names.slice(0, 400).map(n=>({ name: n }));
        const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
        const j:any = await r.json().catch(()=>({}));
        const rows:any[] = Array.isArray(j?.data) ? j.data : [];
        const out: Record<string,string> = {};
        for (const c of rows){
          const img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {};
          const urlSmall = img.small || img.normal || img.art_crop || '';
          const key = norm(c?.name||'');
          if (urlSmall) out[key] = urlSmall;
        }
        thumbs = out;
      } catch {}
    }

    const normPrices: Record<string, number> = {};
    for (const k of Object.keys(prices||{})) normPrices[norm(k)] = Number(prices[k]||0);

    const rows = (items||[]).map((r:any)=>{
      const n = String(r.name||'');
      const key = norm(n);
      const unit = normPrices[key] || 0;
      const thumb = thumbs[key] || '';
      return { name: n, qty: Number(r.qty||0), unit, thumb } as { name:string; qty:number; unit:number; thumb?:string };
    });
    const total = rows.reduce((sum: number, r: { unit:number; qty:number })=> sum + (r.unit||0)*Math.max(0, Number(r.qty||0)), 0);

    return NextResponse.json({ ok:true, items: rows, total, currency });
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
}
