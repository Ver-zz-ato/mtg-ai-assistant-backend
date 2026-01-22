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

    const names: string[] = Array.from(new Set((items||[]).map((r:any)=>String(r.name||'')).filter((s: string): s is string => Boolean(s))));

    // Price enrichment: try snapshot first, fallback to live prices for missing cards
    let prices: Record<string, number> = {};
    if (names.length){
      try{
        // Step 1: Try snapshot prices first
        const pr = await fetch(''+new URL('/api/price/snapshot', url as any), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }), cache: 'no-store' });
        const pj = await pr.json().catch(()=>({}));
        prices = pj?.prices || {};
        
        // Step 2: Check which names are missing from snapshot
        const missingNames: string[] = [];
        for (const name of names) {
          const key = norm(name);
          if (!prices[key] || prices[key] === 0) {
            missingNames.push(name);
          }
        }
        
        // Step 3: Fallback to live prices for missing cards
        if (missingNames.length > 0) {
          try {
            const livePr = await fetch(''+new URL('/api/price', url as any), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names: missingNames, currency }), cache: 'no-store' });
            const livePj = await livePr.json().catch(()=>({}));
            if (livePr.ok && livePj?.ok && livePj.prices) {
              // Merge live prices into snapshot prices
              const livePrices = livePj.prices as Record<string, number> || {};
              for (const [name, price] of Object.entries(livePrices)) {
                const priceNum = typeof price === 'number' ? price : Number(price) || 0;
                if (priceNum > 0) {
                  prices[norm(name)] = priceNum;
                }
              }
            }
          } catch (liveErr: any) {
            console.warn('[wishlists/items] Live price fallback failed:', liveErr);
            // Continue with snapshot prices only
          }
        }
      } catch (err: any) {
        console.error('[wishlists/items] Price fetch failed:', err);
        // Continue without prices
      }
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
