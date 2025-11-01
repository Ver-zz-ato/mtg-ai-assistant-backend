import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

async function scryfallBatch(names: string[], supabase: any) {
  const byNorm = new Map<string, { usd?: number|null; eur?: number|null }>();
  const uniq = Array.from(new Set(names.map(norm)));
  for (let i = 0; i < uniq.length; i += 75) {
    const batch = uniq.slice(i, i+75);
    const body = { identifiers: batch.map(n=>({ name: n })) };
    try {
      const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      const j:any = await r.json().catch(()=>({}));
      const rows:any[] = Array.isArray(j?.data) ? j.data : [];
      for (const c of rows) {
        const k = norm(c?.name||'');
        const usd = c?.prices?.usd ? Number(c.prices.usd) : null;
        const eur = c?.prices?.eur ? Number(c.prices.eur) : null;
        if (k) byNorm.set(k, { usd, eur });
      }
    } catch {}
  }
  return byNorm;
}

export async function POST(req: NextRequest) {
  try {
    let supabase: any = await createClient();
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || '';
    const hdr = req.headers.get('x-cron-key') || '';

    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;

    // Allow CRON_KEY-header calls by escalating to service role (if provided)
    if (!user && cronKey && hdr === cronKey && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      supabase = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    } else if (!user) {
      return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
    }

    // Collect distinct names across deck_cards (only public decks? include all for accuracy)
    const { data: deckNames } = await supabase.from('deck_cards').select('name').limit(50000);
    const names = Array.from(new Set(((deckNames||[]) as any[]).map(r=>String(r.name))));
    if (names.length === 0) return NextResponse.json({ ok:true, inserted:0, snapshot_date: new Date().toISOString().slice(0,10) });

    const prices = await scryfallBatch(names, supabase);

    const today = new Date();
    const snapshot_date = today.toISOString().slice(0,10);

    const rowsUSD: any[] = [];
    const rowsEUR: any[] = [];
    const rowsGBP: any[] = [];
    // Fetch FX for GBP (derive from USD when available)
    let usd_gbp = 0.78;
    try { const fx = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=GBP', { cache:'no-store' }).then(r=>r.json()); usd_gbp = Number(fx?.rates?.GBP || 0.78); } catch {}

    prices.forEach((v, k) => {
      if (typeof v.usd === 'number') rowsUSD.push({ snapshot_date, name_norm: k, currency: 'USD', unit: v.usd, source: 'Scryfall' });
      if (typeof v.eur === 'number') rowsEUR.push({ snapshot_date, name_norm: k, currency: 'EUR', unit: v.eur, source: 'Scryfall' });
      if (typeof v.usd === 'number') rowsGBP.push({ snapshot_date, name_norm: k, currency: 'GBP', unit: +(Number(v.usd)*usd_gbp).toFixed(2), source: 'Scryfall' });
    });

    // Upsert with compound conflict target
    const allRows = [...rowsUSD, ...rowsEUR, ...rowsGBP];
    let inserted = 0;
    for (let i = 0; i < allRows.length; i += 1000) {
      const chunk = allRows.slice(i, i+1000);
      const { error, count } = await supabase.from('price_snapshots').upsert(chunk, { onConflict: 'snapshot_date,name_norm,currency' });
      if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
      inserted += chunk.length;
    }

    // Auto-delete data older than 60 days to maintain retention limit
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60);
      const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
      
      const { getAdmin } = await import("@/app/api/_lib/supa");
      const admin = getAdmin();
      if (admin) {
        const { error: deleteError, count: deletedCount } = await admin
          .from('price_snapshots')
          .delete()
          .lt('snapshot_date', cutoffDateStr);
        
        if (deleteError) {
          console.warn('⚠️ Failed to delete old snapshots:', deleteError.message);
        } else {
          console.log(`🧹 Cleaned up old snapshots: deleted ${deletedCount || 0} rows older than ${cutoffDateStr}`);
        }
      }
    } catch (cleanupError) {
      console.warn('⚠️ Cleanup error (non-fatal):', cleanupError);
    }

    // Record last run and audit (service role if available)
    try {
      const { getAdmin } = await import("@/app/api/_lib/supa");
      const admin = getAdmin();
      if (admin) {
        await admin.from('app_config').upsert({ key: 'job:last:price_snapshot_build', value: new Date().toISOString() }, { onConflict: 'key' });
        const actor = user?.id || (hdr && cronKey && hdr === cronKey ? 'cron' : null);
        await admin.from('admin_audit').insert({ actor_id: actor, action: 'price_snapshot_build', target: snapshot_date });
      }
    } catch {}

    return NextResponse.json({ ok:true, inserted, snapshot_date, names: names.length });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
