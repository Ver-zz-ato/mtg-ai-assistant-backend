import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const maxDuration = 600; // Allowed on Pro Node runtime for 10-min jobs

function norm(s: string): string {
  return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

async function fetchBulkCards(): Promise<any[]> {
  // Find the default_cards bulk dataset and download it
  const meta = await fetch('https://api.scryfall.com/bulk-data', { cache: 'no-store' }).then(r=>r.json());
  const entry = (meta?.data || []).find((d:any)=> d?.type === 'default_cards');
  const url = entry?.download_uri;
  if (!url) throw new Error('No bulk download uri');
  const data = await fetch(url, { cache: 'no-store' }).then(r=>r.json());
  return Array.isArray(data) ? data : [];
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(_req: NextRequest) {
  try {
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
    // Aggregate median price per normalized name
    const byName: Map<string, { usd: number[]; eur: number[] }> = new Map();
    for (const c of all) {
      const n = norm(c?.name||''); if (!n) continue;
      const usd = c?.prices?.usd ? Number(c.prices.usd) : null;
      const eur = c?.prices?.eur ? Number(c.prices.eur) : null;
      if (!byName.has(n)) byName.set(n, { usd: [], eur: [] });
      const ref = byName.get(n)!;
      if (usd != null) ref.usd.push(usd);
      if (eur != null) ref.eur.push(eur);
    }
    function median(arr: number[]): number | null { if (!arr.length) return null; const s = arr.slice().sort((a,b)=>a-b); const m = Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; }

    const today = new Date().toISOString().slice(0,10);
    const rows: any[] = [];
    const rowsGBP: any[] = [];

    // Fetch FX for GBP
    let usd_gbp = 0.78;
    try { const fx = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=GBP', { cache:'no-store' }).then(r=>r.json()); usd_gbp = Number(fx?.rates?.GBP || 0.78); } catch {}

    for (const [k, v] of byName.entries()) {
      const medUSD = median(v.usd);
      const medEUR = median(v.eur);
      if (medUSD != null) rows.push({ snapshot_date: today, name_norm: k, currency: 'USD', unit: +medUSD.toFixed(2), source: 'ScryfallBulk' });
      if (medEUR != null) rows.push({ snapshot_date: today, name_norm: k, currency: 'EUR', unit: +medEUR.toFixed(2), source: 'ScryfallBulk' });
      if (medUSD != null) rowsGBP.push({ snapshot_date: today, name_norm: k, currency: 'GBP', unit: +(medUSD*usd_gbp).toFixed(2), source: 'ScryfallBulk' });
    }

    // Upsert in chunks
    const allRows = [...rows, ...rowsGBP];
    let inserted = 0;
    for (let i = 0; i < allRows.length; i += 1000) {
      const chunk = allRows.slice(i, i+1000);
      const { error } = await supabase.from('price_snapshots').upsert(chunk, { onConflict: 'snapshot_date,name_norm,currency' });
      if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
      inserted += chunk.length;
    }

    // Record last run and audit
    try {
      const { getAdmin } = await import("@/app/api/_lib/supa");
      const admin = getAdmin();
      if (admin) {
        await admin.from('app_config').upsert({ key: 'job:last:price_snapshot_bulk', value: new Date().toISOString() }, { onConflict: 'key' });
        const actor = user?.id || (hdr && cronKey && hdr === cronKey ? 'cron' : null);
        await admin.from('admin_audit').insert({ actor_id: actor, action: 'price_snapshot_bulk', target: today });
      }
    } catch {}

    return NextResponse.json({ ok:true, inserted, snapshot_date: today, mode: 'bulk' });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
