import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

/*
  GET /api/price/deck-series?deck_id=...&currency=USD&from=YYYY-MM-DD
  Returns: { ok: true, currency, from, points: [{ date, total }] }
*/
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const deckId = url.searchParams.get('deck_id') || '';
    const currency = (url.searchParams.get('currency') || 'USD').toUpperCase();
    const from = url.searchParams.get('from') || '';
    if (!deckId) return NextResponse.json({ ok:true, currency, from, points: [] });

    // Get deck cards
    const { data: cards } = await supabase
      .from('deck_cards')
      .select('name, qty')
      .eq('deck_id', deckId)
      .limit(400);
    const arr = Array.isArray(cards) ? (cards as any[]).map(x=>({ name:String(x.name), qty:Number(x.qty||1) })) : [];
    if (!arr.length) return NextResponse.json({ ok:true, currency, from, points: [] });

    const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    const nameSet = Array.from(new Set(arr.map(a=>norm(a.name))));

    // Pull all snapshots for these names and currency (since 'from' if provided)
    let q = supabase
      .from('price_snapshots')
      .select('name_norm, snapshot_date, unit')
      .eq('currency', currency)
      .in('name_norm', nameSet)
      .order('snapshot_date', { ascending: true });
    if (from) q = q.gte('snapshot_date', from);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    // qty map
    const qtyMap = new Map<string, number>();
    for (const { name, qty } of arr) qtyMap.set(norm(name), (qtyMap.get(norm(name))||0) + Number(qty||1));

    // Aggregate total per date
    const byDate = new Map<string, number>();
    for (const row of (data||[]) as any[]) {
      const n = String(row.name_norm);
      const d = String(row.snapshot_date);
      const unit = Number(row.unit)||0;
      const qn = qtyMap.get(n)||0;
      byDate.set(d, (byDate.get(d)||0) + unit*qn);
    }
    const points = Array.from(byDate.entries()).map(([date, total]) => ({ date, total: Number(total.toFixed(2)) })).sort((a,b)=>String(a.date).localeCompare(String(b.date)));

    return NextResponse.json({ ok:true, currency, from, points });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
