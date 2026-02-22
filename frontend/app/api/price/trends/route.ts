// app/api/price/trends/route.ts
// Batch endpoint to get price trend direction for multiple cards

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

/**
 * POST /api/price/trends
 * Body: { names: string[], currency?: 'USD'|'EUR'|'GBP', windowDays?: number }
 * Returns: { ok: true, trends: { [name]: { direction: 'up'|'down'|'flat', pctChange: number } } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const names: string[] = Array.isArray(body.names) ? body.names.slice(0, 100) : [];
    const currency = (body.currency || 'USD').toUpperCase();
    const windowDays = Math.max(1, Math.min(30, Number(body.windowDays) || 7));
    const threshold = Number(body.threshold) || 0.03; // 3% default threshold

    if (names.length === 0) {
      return NextResponse.json({ ok: true, trends: {} });
    }

    const supabase = await getServerSupabase();

    // Find latest snapshot date
    const { data: latestRows } = await supabase
      .from('price_snapshots')
      .select('snapshot_date')
      .eq('currency', currency)
      .order('snapshot_date', { ascending: false })
      .limit(1);
    
    const latest = (latestRows as any[])?.[0]?.snapshot_date || null;
    if (!latest) {
      return NextResponse.json({ ok: true, trends: {} });
    }

    // Find prior snapshot date
    const cutoff = new Date(new Date(latest).getTime() - windowDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: priorRows } = await supabase
      .from('price_snapshots')
      .select('snapshot_date')
      .eq('currency', currency)
      .gte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: true })
      .limit(1);

    const prior = (priorRows as any[])?.[0]?.snapshot_date || null;
    if (!prior || prior === latest) {
      return NextResponse.json({ ok: true, trends: {} });
    }

    // Normalize names for lookup
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizedNames = names.map(norm);

    // Fetch price data for both dates
    const { data } = await supabase
      .from('price_snapshots')
      .select('name_norm, snapshot_date, unit')
      .eq('currency', currency)
      .in('snapshot_date', [prior, latest])
      .in('name_norm', normalizedNames);

    const rows = Array.isArray(data) ? (data as any[]) : [];

    // Build price map by name
    const byName: Record<string, { prior?: number; latest?: number }> = {};
    for (const r of rows) {
      const k = String(r.name_norm);
      if (!byName[k]) byName[k] = {};
      if (r.snapshot_date === prior) byName[k].prior = Number(r.unit);
      if (r.snapshot_date === latest) byName[k].latest = Number(r.unit);
    }

    // Compute trends
    const trends: Record<string, { direction: 'up' | 'down' | 'flat'; pctChange: number }> = {};

    for (const name of names) {
      const key = norm(name);
      const priceData = byName[key];

      if (!priceData?.prior || !priceData?.latest || priceData.prior <= 0) {
        trends[name] = { direction: 'flat', pctChange: 0 };
        continue;
      }

      const pctChange = (priceData.latest - priceData.prior) / priceData.prior;

      let direction: 'up' | 'down' | 'flat' = 'flat';
      if (pctChange > threshold) direction = 'up';
      else if (pctChange < -threshold) direction = 'down';

      trends[name] = { direction, pctChange };
    }

    return NextResponse.json({ ok: true, trends });
  } catch (error) {
    console.error('Price trends error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
