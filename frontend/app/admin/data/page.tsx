'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

export default function DataPage(){
  const [name, setName] = React.useState('');
  const [row, setRow] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [lastRun, setLastRun] = React.useState<Record<string, string|undefined>>({});

  React.useEffect(() => {
    // Fetch last-run timestamps from app_config keys
    async function load() {
      try {
        const q = ['/api/admin/config?key=job:last:prewarm_scryfall','key=job:last:price_snapshot_build','key=job:last:price_snapshot_bulk','key=job:last:cron_price_snapshot'].join('&');
        const r = await fetch(`/api/admin/config?${q}`, { cache: 'no-store' });
        const j = await r.json();
        if (j?.ok !== false) setLastRun(j?.config || {});
      } catch {}
    }
    load();
  }, []);

  function fmt(ts?: string){ if (!ts) return '—'; try { const d = new Date(ts); return d.toLocaleString(); } catch { return String(ts||''); } }

  async function lookup(){ setBusy(true); try { const r = await fetch(`/api/admin/scryfall-cache?name=${encodeURIComponent(name)}`); const j = await r.json(); if (!r.ok || j?.ok===false) throw new Error(j?.error||'fetch_failed'); setRow(j.row||null);} catch(e:any){ alert(e?.message||'failed'); setRow(null);} finally{ setBusy(false);} }
  async function refresh(){ setBusy(true); try { const r = await fetch('/api/admin/scryfall-cache', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name })}); const j = await r.json(); if (!r.ok || j?.ok===false) throw new Error(j?.error||'refresh_failed'); await lookup(); } catch(e:any){ alert(e?.message||'failed'); } finally{ setBusy(false);} }

  async function runCron(path: string, isHeavy = false){ 
    setBusy(true); 
    try { 
      const timeout = isHeavy ? 300000 : 30000; // 5min for heavy jobs, 30s for light jobs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const r = await fetch(path, { 
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      }); 
      
      clearTimeout(timeoutId);
      
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(errorData.error || `${path} failed with status ${r.status}`);
      }
      
      const result = await r.json();
      const message = isHeavy 
        ? `✅ ${path.split('/').pop()} completed successfully! ${result.inserted ? `Inserted ${result.inserted} records.` : ''}`
        : `✅ ${path.split('/').pop()} triggered successfully!`;
      
      alert(message);
      
      // Reload last-run timestamps after successful operation
      setTimeout(() => window.location.reload(), 1000);
    } catch(e:any){ 
      if (e.name === 'AbortError') {
        alert(`⏱️ ${path.split('/').pop()} is taking longer than expected. It may still be running in the background.`);
      } else {
        alert(`❌ ${path.split('/').pop()} failed: ${e?.message || 'Unknown error'}`);
      }
    } finally { 
      setBusy(false); 
    } 
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Data & Pricing</div>
      <ELI5 heading="Data & Pricing" items={[
        'Peek at or refresh a single card\'s cached Scryfall entry when something looks stale.',
        'Kick off maintenance jobs like prewarming caches or building price snapshots.',
        'Future: a heatmap to spot big price swings.'
      ]} />

      {/* Scryfall cache inspector */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Scryfall Cache Inspector <HelpTip text="Read the cached API response for one card. Use Refresh to re-fetch from Scryfall and store it." /></div>
        <div className="flex gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Card name" className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" />
          <button onClick={lookup} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">Lookup</button>
          <button onClick={refresh} disabled={busy||!name} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm">Refresh</button>
        </div>
        {row && (<pre className="text-xs bg-black/40 border border-neutral-800 rounded p-2 overflow-auto max-h-64">{JSON.stringify(row, null, 2)}</pre>)}
      </section>

      {/* Bulk jobs monitor (trigger buttons + ELI5) */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Bulk Jobs Monitor <HelpTip text="Fire-and-forget admin tasks: warm caches or build price snapshots. These may run server-side for a while." /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded border border-neutral-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Prewarm Scryfall</div>
              <button onClick={()=>runCron('/api/cron/prewarm-scryfall')} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Run</button>
            </div>
            <div className="mt-2">
              <ELI5 heading="Prewarm Scryfall" items={[
                'Preloads popular card images and details so pages feel instant for users.',
                'Scans recent public decks and commanders, then warms the cache for the top ~400 names.',
                'Run daily (or before big spikes in traffic).',
                `Last run: ${fmt(lastRun['job:last:prewarm_scryfall'])}`,
              ]} />
            </div>
          </div>

          <div className="rounded border border-neutral-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Daily Snapshot</div>
              <button onClick={()=>runCron('/api/price/snapshot')} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Run</button>
            </div>
            <div className="mt-2">
              <ELI5 heading="Daily Snapshot" items={[
                'Captures current prices for cards appearing in user decks (targeted set).',
                'Useful for lightweight daily updates without full bulk import.',
                'Run daily (off-peak hours).',
                `Last run: ${fmt(lastRun['job:last:cron_price_snapshot'])}`,
              ]} />
            </div>
          </div>

          <div className="rounded border border-neutral-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Build Snapshot (admin)</div>
              <button onClick={()=>runCron('/api/admin/price/snapshot/build', true)} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Run</button>
            </div>
            <div className="mt-2">
              <ELI5 heading="Build Snapshot" items={[
                'Builds and saves today\'s snapshot for all names observed in decks (USD/EUR/derived GBP).',
                'Populates price_snapshots for reporting and charts.',
                'Run daily after prewarm (cron).',
                `Last run: ${fmt(lastRun['job:last:price_snapshot_build'])}`,
              ]} />
            </div>
          </div>

          <div className="rounded border border-neutral-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Weekly FULL (admin)</div>
              <button onClick={()=>runCron('/api/admin/price/snapshot/bulk', true)} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">Run</button>
            </div>
            <div className="mt-2">
              <ELI5 heading="Weekly FULL" items={[
                'Downloads the full Scryfall bulk list and computes median prices by card name.',
                'Heavier job; produces a comprehensive snapshot across all cards.',
                'Run weekly (off-peak), e.g., Sunday early morning.',
                `Last run: ${fmt(lastRun['job:last:price_snapshot_bulk'])}`,
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* Heatmap placeholder */}
      <section className="rounded border border-neutral-800 p-3">
        <div className="font-medium">Price Delta Heatmap <HelpTip text="Visualize which cards moved in price the most between snapshots. Placeholder for now." /></div>
        <div className="text-sm opacity-70">Coming soon — needs snapshot history table.</div>
      </section>
    </div>
  );
}
