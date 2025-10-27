import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

function esc(s: string){ return '"' + String(s||'').replace(/"/g,'""') + '"'; }

export async function GET(req: NextRequest){
  try{
    const url = new URL(req.url);
    const wishlistId = String(url.searchParams.get('wishlistId')||'');
    if (!wishlistId) return new Response('wishlistId required', { status:400 });

    const supabase = await getServerSupabase();
    const { data: rows, error } = await (supabase as any)
      .from('wishlist_items')
      .select('name, qty')
      .eq('wishlist_id', wishlistId)
      .order('name', { ascending: true });
    if (error) return new Response(error.message, { status:500 });

    const items: Array<{name:string; qty:number}> = Array.isArray(rows)? rows as any[] : [];
    const head = ['Name','Qty'];
    const body = items.map(it => [String(it.name||''), String(Math.max(0, Number(it.qty||0))) ]);
    const csv = [head, ...body].map(r => r.map(esc).join(',')).join('\n');
    return new Response(csv, { status:200, headers: { 'content-type':'text/csv; charset=utf-8', 'cache-control':'no-store' } });
  }catch(e:any){ return new Response(e?.message||'server_error', { status:500 }); }
}
