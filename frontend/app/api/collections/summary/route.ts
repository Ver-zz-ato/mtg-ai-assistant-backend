import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetchAllRows';

function norm(name: string): string {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export type CollectionSummary = {
  totalCards: number;
  unique: number;
  estValueUSD: number;
  lastUpdated: string | null;
  cover?: { small?: string; art?: string };
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: collections, error: colErr } = await supabase
      .from('collections')
      .select('id, hero_card_name')
      .eq('user_id', user.id);

    if (colErr) {
      return NextResponse.json({ ok: false, error: colErr.message }, { status: 500 });
    }

    const list = collections || [];
    if (!list.length) {
      return NextResponse.json({ ok: true, summaries: {} });
    }

    const collectionIds = list.map((c) => c.id);
    const allCards = await fetchAllSupabaseRows<{ collection_id: string; name: string; qty: number; created_at?: string }>(
      () => supabase
        .from('collection_cards')
        .select('collection_id, name, qty, created_at')
        .in('collection_id', collectionIds)
        .order('id', { ascending: true }),
    );

    const cardsByCollection = new Map<string, Array<{ name: string; qty: number; created_at?: string }>>();
    for (const row of allCards) {
      const arr = cardsByCollection.get(row.collection_id) || [];
      arr.push({ name: row.name, qty: Number(row.qty) || 0, created_at: row.created_at });
      cardsByCollection.set(row.collection_id, arr);
    }

    const allNames = new Set<string>();
    for (const items of cardsByCollection.values()) {
      for (const it of items) allNames.add(it.name);
    }

    const prices: Record<string, number> = {};
    const names = Array.from(allNames);
    if (names.length) {
      const keys = Array.from(new Set(names.map(norm)));
      const { data: priceRows } = await supabase
        .from('price_snapshots')
        .select('name_norm, unit, snapshot_date')
        .eq('currency', 'USD')
        .in('name_norm', keys)
        .order('snapshot_date', { ascending: false });

      const seen = new Set<string>();
      for (const row of priceRows || []) {
        const k = String((row as { name_norm: string }).name_norm);
        if (seen.has(k)) continue;
        seen.add(k);
        prices[k] = Number((row as { unit: number }).unit) || 0;
      }
    }

    const coverNames = new Set<string>();
    const summaries: Record<string, CollectionSummary> = {};

    for (const col of list) {
      const items = cardsByCollection.get(col.id) || [];
      const totalCards = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const unique = items.length;
      const lastUpdated = items.length
        ? (items.map((i) => i.created_at || '').filter(Boolean).sort().pop() || null)
        : null;

      let estValueUSD = 0;
      let coverName: string | null = null;
      const heroName = col.hero_card_name?.trim();
      if (heroName && items.some((it) => it.name === heroName)) {
        coverName = heroName;
      } else if (items.length) {
        let best = { name: '', score: -1 };
        for (const it of items) {
          const unit = prices[norm(it.name)] || 0;
          const score = unit * (Number(it.qty) || 1);
          if (score > best.score) best = { name: it.name, score };
        }
        coverName = best.name || items.sort((a, b) => (b.qty || 0) - (a.qty || 0))[0]?.name || null;
      }

      for (const it of items) {
        estValueUSD += (prices[norm(it.name)] || 0) * (Number(it.qty) || 0);
      }

      if (coverName) coverNames.add(coverName);
      summaries[col.id] = { totalCards, unique, estValueUSD, lastUpdated };
    }

    if (coverNames.size) {
      const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
      const details = await getDetailsForNamesCached(Array.from(coverNames));
      for (const col of list) {
        const items = cardsByCollection.get(col.id) || [];
        const heroName = col.hero_card_name?.trim();
        let pick = heroName && items.some((it) => it.name === heroName) ? heroName : null;
        if (!pick && items.length) {
          let best = { name: '', score: -1 };
          for (const it of items) {
            const unit = prices[norm(it.name)] || 0;
            const score = unit * (Number(it.qty) || 0);
            if (score > best.score) best = { name: it.name, score };
          }
          pick = best.name || items[0]?.name || null;
        }
        if (!pick) continue;
        const card = details.get(norm(pick));
        const uris = (card as { image_uris?: { normal?: string; small?: string; art_crop?: string } })?.image_uris;
        if (uris) {
          summaries[col.id].cover = {
            small: uris.normal || uris.small,
            art: uris.art_crop,
          };
        }
      }
    }

    return NextResponse.json({ ok: true, summaries });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'server_error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
