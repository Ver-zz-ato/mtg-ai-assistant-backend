import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const maxDuration = 600; // 10 minutes for large bulk operations

function norm(s: string): string {
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

async function fetchBulkCards(): Promise<any[]> {
  // Find the default_cards bulk dataset and download it
  console.log('📥 Fetching Scryfall bulk data metadata...');
  const meta = await fetch('https://api.scryfall.com/bulk-data', { cache: 'no-store' }).then(r=>r.json());
  const entry = (meta?.data || []).find((d:any)=> d?.type === 'default_cards');
  const url = entry?.download_uri;
  if (!url) throw new Error('No bulk download uri');
  console.log(`⬇️ Downloading bulk card data from Scryfall (${entry?.size ? Math.round(entry.size/1024/1024) : '?'}MB)...`);
  const data = await fetch(url, { cache: 'no-store' }).then(r=>r.json());
  const cards = Array.isArray(data) ? data : [];
  console.log(`✅ Downloaded ${cards.length} cards from Scryfall bulk data`);
  return cards;
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(_req: NextRequest) {
  const startTime = Date.now();
  try {
    console.log('🚀 Starting bulk price snapshot job...');
    let supabase: any = await createClient();
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || '';
    const hdr = _req.headers.get('x-cron-key') || '';
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;
    
    // Allow cron key OR admin user
    if (!user && cronKey && hdr === cronKey && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      supabase = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    } else if (!user) {
      return NextResponse.json({ ok:false, error:'unauthorized - no user' }, { status:401 });
    } else if (user && !isAdmin(user)) {
      return NextResponse.json({ ok:false, error:'forbidden - admin required' }, { status:403 });
    }

    const all = await fetchBulkCards();
    console.log(`🔄 Processing ${all.length} cards and aggregating prices...`);
    
    // Aggregate median price per normalized name
    const byName: Map<string, { usd: number[]; eur: number[] }> = new Map();
    let processed = 0;
    for (const c of all) {
      processed++;
      if (processed % 10000 === 0) {
        console.log(`   Processed ${processed}/${all.length} cards (${Math.round(processed/all.length*100)}%)...`);
      }
      const n = norm(c?.name||''); if (!n) continue;
      const usd = c?.prices?.usd ? Number(c.prices.usd) : null;
      const eur = c?.prices?.eur ? Number(c.prices.eur) : null;
      if (!byName.has(n)) byName.set(n, { usd: [], eur: [] });
      const ref = byName.get(n)!;
      if (usd != null) ref.usd.push(usd);
      if (eur != null) ref.eur.push(eur);
    }
    console.log(`✅ Aggregated prices for ${byName.size} unique card names`);
    function median(arr: number[]): number | null { if (!arr.length) return null; const s = arr.slice().sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; }

    const today = new Date().toISOString().slice(0,10);
    const rows: any[] = [];
    const rowsGBP: any[] = [];

    // Fetch FX for GBP
    console.log('💱 Fetching GBP exchange rate...');
    let usd_gbp = 0.78;
    try { 
      const fx = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=GBP', { cache:'no-store' }).then(r=>r.json()); 
      usd_gbp = Number(fx?.rates?.GBP || 0.78);
      console.log(`   USD to GBP rate: ${usd_gbp}`);
    } catch (e) {
      console.warn('⚠️ Could not fetch GBP rate, using default 0.78');
    }

    console.log('📊 Generating snapshot rows (USD, EUR, GBP)...');
    for (const [k, v] of byName.entries()) {
      const medUSD = median(v.usd);
      const medEUR = median(v.eur);
      if (medUSD != null) rows.push({ snapshot_date: today, name_norm: k, currency: 'USD', unit: +medUSD.toFixed(2), source: 'ScryfallBulk' });
      if (medEUR != null) rows.push({ snapshot_date: today, name_norm: k, currency: 'EUR', unit: +medEUR.toFixed(2), source: 'ScryfallBulk' });
      if (medUSD != null) rowsGBP.push({ snapshot_date: today, name_norm: k, currency: 'GBP', unit: +(medUSD*usd_gbp).toFixed(2), source: 'ScryfallBulk' });
    }

    // Upsert in chunks
    const allRows = [...rows, ...rowsGBP];
    console.log(`💾 Inserting ${allRows.length} snapshot rows into database (in batches of 1000)...`);
    let inserted = 0;
    for (let i = 0; i < allRows.length; i += 1000) {
      const chunk = allRows.slice(i, i+1000);
      const { error } = await supabase.from('price_snapshots').upsert(chunk, { onConflict: 'snapshot_date,name_norm,currency' });
      if (error) {
        console.error(`❌ Database error at batch ${i}:`, error.message);
        return NextResponse.json({ ok:false, error: error.message }, { status:500 });
      }
      inserted += chunk.length;
      if (i % 10000 === 0 && i > 0) {
        console.log(`   Inserted ${inserted}/${allRows.length} rows (${Math.round(inserted/allRows.length*100)}%)...`);
      }
    }
    console.log(`✅ Successfully inserted ${inserted} snapshot rows`);

    // Auto-delete data older than 60 days to maintain retention limit
    console.log('🧹 Cleaning up old snapshots (older than 60 days)...');
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
          console.log(`✅ Cleaned up ${deletedCount || 0} rows older than ${cutoffDateStr}`);
        }
      }
    } catch (cleanupError) {
      console.warn('⚠️ Cleanup error (non-fatal):', cleanupError);
    }

    // Record last run and audit
    console.log('📝 Recording job completion timestamp...');
    try {
      const { getAdmin } = await import("@/app/api/_lib/supa");
      const admin = getAdmin();
      if (admin) {
        await admin.from('app_config').upsert({ key: 'job:last:price_snapshot_bulk', value: new Date().toISOString() }, { onConflict: 'key' });
        const actor = user?.id || (hdr && cronKey && hdr === cronKey ? 'cron' : null);
        await admin.from('admin_audit').insert({ actor_id: actor, action: 'price_snapshot_bulk', target: today });
      }
    } catch (e) {
      console.warn('⚠️ Could not record audit log:', e);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`🎉 Price snapshot job completed successfully in ${duration} seconds!`);
    console.log(`   • Unique cards: ${byName.size}`);
    console.log(`   • Total snapshots: ${inserted} (USD+EUR+GBP)`);
    console.log(`   • Snapshot date: ${today}`);

    return NextResponse.json({ 
      ok:true, 
      inserted, 
      snapshot_date: today, 
      mode: 'bulk',
      unique_cards: byName.size,
      duration_seconds: duration
    });
  } catch (e:any) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`❌ Price snapshot job failed after ${duration} seconds:`, e);
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
