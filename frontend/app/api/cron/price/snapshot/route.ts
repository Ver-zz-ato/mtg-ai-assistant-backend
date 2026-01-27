import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for snapshot job

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

async function scryfallBatch(names: string[]) {
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

async function runSnapshot(req: NextRequest) {
  try {
    const isVercelCron = !!req.headers.get('x-vercel-cron');
    const key = req.nextUrl.searchParams.get('key') || '';
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || '';
    if (!(isVercelCron || (cronKey && key && key === cronKey))) {
      return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !sr) return NextResponse.json({ ok:false, error:'missing_service_role' }, { status:500 });
    const supabase = createAdmin(url, sr, { auth: { persistSession: false } });

    // Fetch card names from both deck_cards AND collection_cards
    const [deckResult, collectionResult] = await Promise.all([
      supabase.from('deck_cards').select('name').limit(50000),
      supabase.from('collection_cards').select('name').limit(50000)
    ]);
    
    const deckNames = Array.from(new Set(((deckResult.data||[]) as any[]).map(r=>String(r.name))));
    const collectionNames = Array.from(new Set(((collectionResult.data||[]) as any[]).map(r=>String(r.name))));
    
    // Combine and deduplicate
    const allNames = Array.from(new Set([...deckNames, ...collectionNames]));
    const names = allNames.filter(Boolean);
    
    if (names.length === 0) return NextResponse.json({ ok:true, inserted:0, snapshot_date: new Date().toISOString().slice(0,10) });

    const prices = await scryfallBatch(names);
    const today = new Date().toISOString().slice(0,10);

    const rows: any[] = [];
    const rowsGBP: any[] = [];
    // FX for GBP
    let usd_gbp = 0.78;
    try { const fx = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=GBP', { cache:'no-store' }).then(r=>r.json()); usd_gbp = Number(fx?.rates?.GBP || 0.78); } catch {}

    prices.forEach((v, k) => {
      if (typeof v.usd === 'number') rows.push({ snapshot_date: today, name_norm: k, currency: 'USD', unit: v.usd, source: 'Scryfall' });
      if (typeof v.eur === 'number') rows.push({ snapshot_date: today, name_norm: k, currency: 'EUR', unit: v.eur, source: 'Scryfall' });
      if (typeof v.usd === 'number') rowsGBP.push({ snapshot_date: today, name_norm: k, currency: 'GBP', unit: +(Number(v.usd)*usd_gbp).toFixed(2), source: 'Scryfall' });
    });

    const allRows = [...rows, ...rowsGBP];
    for (let i = 0; i < allRows.length; i += 1000) {
      const chunk = allRows.slice(i, i+1000);
      const { error } = await supabase.from('price_snapshots').upsert(chunk, { onConflict: 'snapshot_date,name_norm,currency' });
      if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
    }

    // Record last run and audit
    try {
      await supabase.from('app_config').upsert({ key: 'job:last:price_snapshot_bulk', value: new Date().toISOString() }, { onConflict: 'key' });
      await supabase.from('admin_audit').insert({ actor_id: 'cron', action: 'cron_price_snapshot', target: today });
    } catch {}

    return NextResponse.json({ ok:true, inserted: allRows.length, snapshot_date: today });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}

export async function GET(req: NextRequest) {
  return runSnapshot(req);
}

export async function POST(req: NextRequest) {
  console.log("📈 Price snapshot endpoint called");
  
  try {
    // Check admin authentication
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = req.headers.get("x-cron-key") || "";
    console.log("🔑 Auth check - cronKey exists:", !!cronKey, "header exists:", !!hdr);

    let useAdmin = false;

    if (cronKey && hdr === cronKey) {
      useAdmin = true;
      console.log("✅ Cron key auth successful");
    } else {
      console.log("🔍 Trying user auth...");
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isAdmin(user)) {
          useAdmin = true;
          console.log("✅ Admin user auth successful");
        }
      } catch (authError: any) {
        console.log("❌ User auth failed:", authError.message);
      }
    }

    if (!useAdmin) {
      console.log("❌ Authorization failed");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    console.log("🚀 Authorization successful, starting price snapshot...");
    
    // Run the snapshot with admin authentication bypassed
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !sr) {
      return NextResponse.json({ ok:false, error:'missing_service_role' }, { status:500 });
    }
    const supabase = createAdmin(url, sr, { auth: { persistSession: false } });

    console.log("🗄️ Fetching card names from decks and collections...");
    const [deckResult, collectionResult] = await Promise.all([
      supabase.from('deck_cards').select('name').limit(50000),
      supabase.from('collection_cards').select('name').limit(50000)
    ]);
    
    const deckNames = Array.from(new Set(((deckResult.data||[]) as any[]).map(r=>String(r.name))));
    const collectionNames = Array.from(new Set(((collectionResult.data||[]) as any[]).map(r=>String(r.name))));
    
    // Combine and deduplicate
    const allNames = Array.from(new Set([...deckNames, ...collectionNames]));
    const names = allNames.filter(Boolean);
    
    if (names.length === 0) {
      console.log("⚠️ No cards found in decks or collections");
      return NextResponse.json({ 
        ok:true, 
        inserted:0, 
        snapshot_date: new Date().toISOString().slice(0,10) 
      });
    }

    console.log(`🎯 Found ${names.length} unique card names (${deckNames.length} from decks, ${collectionNames.length} from collections)`);
    console.log("💰 Fetching prices from Scryfall...");
    
    const prices = await scryfallBatch(names);
    const today = new Date().toISOString().slice(0,10);

    const rows: any[] = [];
    const rowsGBP: any[] = [];
    
    // FX for GBP
    let usd_gbp = 0.78;
    try { 
      const fx = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=GBP', { cache:'no-store' }).then(r=>r.json()); 
      usd_gbp = Number(fx?.rates?.GBP || 0.78); 
    } catch {}

    prices.forEach((v, k) => {
      if (typeof v.usd === 'number') rows.push({ snapshot_date: today, name_norm: k, currency: 'USD', unit: v.usd, source: 'Scryfall' });
      if (typeof v.eur === 'number') rows.push({ snapshot_date: today, name_norm: k, currency: 'EUR', unit: v.eur, source: 'Scryfall' });
      if (typeof v.usd === 'number') rowsGBP.push({ snapshot_date: today, name_norm: k, currency: 'GBP', unit: +(Number(v.usd)*usd_gbp).toFixed(2), source: 'Scryfall' });
    });

    const allRows = [...rows, ...rowsGBP];
    
    console.log(`💾 Upserting ${allRows.length} snapshot rows...`);
    
    for (let i = 0; i < allRows.length; i += 1000) {
      const chunk = allRows.slice(i, i+1000);
      const { error } = await supabase.from('price_snapshots').upsert(chunk, { onConflict: 'snapshot_date,name_norm,currency' });
      if (error) {
        console.error(`❌ Chunk ${i}-${i+1000} failed:`, error.message);
        return NextResponse.json({ ok:false, error: error.message }, { status:500 });
      }
      console.log(`✅ Upserted chunk ${Math.floor(i/1000) + 1}`);
    }

    // Record last run and audit
    try {
      await supabase.from('app_config').upsert({ key: 'job:last:price_snapshot_bulk', value: new Date().toISOString() }, { onConflict: 'key' });
      await supabase.from('admin_audit').insert({ actor_id: 'cron', action: 'cron_price_snapshot', target: today });
    } catch {}

    console.log(`✅ Price snapshot completed: ${allRows.length} rows inserted`);

    return NextResponse.json({ 
      ok:true, 
      inserted: allRows.length, 
      snapshot_date: today 
    });
  } catch (error: any) {
    console.error("❌ Price snapshot failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "snapshot_failed" 
    }, { status: 500 });
  }
}
