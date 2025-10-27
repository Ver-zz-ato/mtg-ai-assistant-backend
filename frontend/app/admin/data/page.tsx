'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';

export default function DataPage(){
  const [name, setName] = React.useState('');
  const [row, setRow] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [currentOperation, setCurrentOperation] = React.useState<string>('');
  const [progress, setProgress] = React.useState(0);
  const [lastRun, setLastRun] = React.useState<Record<string, string|undefined>>({});

  React.useEffect(() => {
    // Fetch last-run timestamps from app_config keys
    async function load() {
      try {
        const q = ['/api/admin/config?key=job:last:prewarm_scryfall','key=job:last:price_snapshot_build','key=job:last:price_snapshot_bulk','key=job:last:cron_price_snapshot','key=job:last:bulk_price_import','key=job:last:bulk_scryfall'].join('&');
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
    setProgress(0);
    const operationName = path.split('/').pop() || 'operation';
    setCurrentOperation(operationName);
    
    try { 
      const timeout = isHeavy ? 300000 : 30000; // 5min for heavy jobs, 30s for light jobs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Simulate progress for user feedback
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev; // Don't complete until we get response
          return prev + (isHeavy ? 2 : 10); // Slower progress for heavy operations
        });
      }, isHeavy ? 2000 : 500);
      
      const r = await fetch(path, { 
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      }); 
      
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      setProgress(100);
      
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(errorData.error || `${path} failed with status ${r.status}`);
      }
      
      const result = await r.json();
      const message = isHeavy 
        ? `✅ ${operationName} completed successfully! ${result.inserted ? `Inserted ${result.inserted} records.` : ''}`
        : `✅ ${operationName} triggered successfully!`;
      
      alert(message);
      
      // Reload last-run timestamps after successful operation
      setTimeout(() => window.location.reload(), 1000);
    } catch(e:any){ 
      if (e.name === 'AbortError') {
        alert(`⏱️ ${operationName} is taking longer than expected. It may still be running in the background.`);
      } else {
        alert(`❌ ${operationName} failed: ${e?.message || 'Unknown error'}`);
      }
    } finally { 
      setBusy(false);
      setProgress(0);
      setCurrentOperation(''); 
    } 
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-xl font-semibold">Data & Pricing</div>
      <ELI5 heading="Data & Pricing Cache Management" items={[
        '🔍 Card Lookup: Check if a card is cached and what data Scryfall has for it',
        '🔄 Refresh Cache: Force-update a specific card if data is stale or wrong',
        '⚡ Prewarm Jobs: Pre-load popular cards so pages load instantly',
        '💰 Price Snapshots: Daily/weekly jobs to capture card price history',
        '📊 Bulk Import: Updates ALL 27k+ cached cards with latest Scryfall prices (491MB file)',
        '⏱️ When to use: User reports wrong price/data, or cache seems outdated',
        '🔄 How often: Bulk import runs weekly automatically; manual refresh as needed',
        '💡 Each job shows when it last ran successfully',
        'Future: a heatmap to spot big price swings.'
      ]} />

      {/* Scryfall cache inspector */}
      <section className="rounded border border-neutral-800 p-3 space-y-2">
        <div className="font-medium">Scryfall Cache Inspector <HelpTip text="Read the cached API response for one card. Use Refresh to re-fetch from Scryfall and store it." /></div>
        <div className="flex gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Card name" className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" />
          <button onClick={lookup} disabled={busy} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">
            {busy ? 'Working...' : 'Lookup'}
          </button>
          <button onClick={refresh} disabled={busy||!name} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm">
            {busy ? 'Working...' : 'Refresh'}
          </button>
        </div>
        {row && (<pre className="text-xs bg-black/40 border border-neutral-800 rounded p-2 overflow-auto max-h-64">{JSON.stringify(row, null, 2)}</pre>)}
      </section>

      {/* Progress Bar */}
      {busy && (
        <section className="rounded border border-blue-600 bg-blue-50 dark:bg-blue-950 p-4 space-y-3">
          <div className="font-medium text-blue-800 dark:text-blue-200">
            🔄 Running: {currentOperation}
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
              style={{ width: `${progress}%` }}
            >
              {progress > 20 && (
                <span className="text-white text-xs font-medium">{Math.round(progress)}%</span>
              )}
            </div>
          </div>
          <div className="text-sm text-blue-700 dark:text-blue-300">
            {progress < 90 ? 'Processing...' : progress === 100 ? 'Completing...' : 'In progress...'}
          </div>
        </section>
      )}

      {/* Bulk jobs monitor (trigger buttons + ELI5) */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Bulk Jobs Monitor <HelpTip text="Fire-and-forget admin tasks: warm caches or build price snapshots. These may run server-side for a while." /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded border border-neutral-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Prewarm Scryfall</div>
              <button 
                onClick={()=>runCron('/api/cron/prewarm-scryfall')} 
                disabled={busy}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-800"
              >
                {busy && currentOperation === 'prewarm-scryfall' ? '🔄 Running...' : 'Run'}
              </button>
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
              <button 
                onClick={()=>runCron('/api/price/snapshot')} 
                disabled={busy}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-800"
              >
                {busy && currentOperation === 'snapshot' ? '🔄 Running...' : 'Run'}
              </button>
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
              <button 
                onClick={()=>runCron('/api/admin/price/snapshot/build', true)} 
                disabled={busy}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-800"
              >
                {busy && currentOperation === 'build' ? '🔄 Running...' : 'Run'}
              </button>
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
              <button 
                onClick={()=>runCron('/api/admin/price/snapshot/bulk', true)} 
                disabled={busy}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-800"
              >
                {busy && currentOperation === 'bulk' ? '🔄 Running...' : 'Run'}
              </button>
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


          <div className="rounded border border-green-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">🚀 Bulk Price Import (NEW)</div>
              <button 
                onClick={()=>runCron('/api/cron/bulk-price-import', true)} 
                disabled={busy}
                className="px-3 py-1.5 rounded border border-green-700 bg-green-900/50 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-800/50"
              >
                {busy && currentOperation === 'bulk-price-import' ? '🔄 Running...' : 'Import ALL Prices'}
              </button>
            </div>
            <div className="mt-2">
              <ELI5 heading="Bulk Price Import" items={[
                '🔥 Downloads Scryfall\'s complete 491MB daily bulk file with ALL card pricing.',
                'Updates prices for ALL cached cards (~27k+) in one go - 100% coverage!',
                'Takes 3-5 minutes but covers every single card vs 200/day from regular updates.',
                'Uses bulk download (no API rate limits) - Scryfall\'s preferred method.',
                'Perfect for weekly manual runs to ensure all prices are fresh.',
                `Last run: ${fmt(lastRun['job:last:bulk_price_import'])}`,
              ]} />
            </div>
          </div>

          <div className="rounded border border-purple-800 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">🎨 Bulk Scryfall Import (NEW)</div>
              <button 
                onClick={()=>runCron('/api/cron/bulk-scryfall', true)} 
                disabled={busy}
                className="px-3 py-1.5 rounded border border-purple-700 bg-purple-900/50 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-800/50"
              >
                {busy && currentOperation === 'bulk-scryfall' ? '🔄 Running...' : 'Import Card Metadata'}
              </button>
            </div>
            <div className="mt-2">
              <ELI5 heading="Bulk Scryfall Import" items={[
                '🎨 Downloads ALL 110k+ cards with complete metadata (images, text, types, RARITY, set info).',
                '✨ Populates the scryfall_cache table with EVERYTHING - not just prices!',
                '🔥 CRITICAL: This is the ONLY way to populate rarity data for "Cost to Finish" charts!',
                'Takes 3-5 minutes but gives 100% coverage for card details.',
                'Uses Scryfall\'s bulk download (no rate limits) - downloads ~300MB of card data.',
                'Run this AFTER Bulk Price Import to get both prices AND card details.',
                '💡 "Prewarm" only updates ~400 popular cards; this updates ALL 110k!',
                `Last run: ${fmt(lastRun['job:last:bulk_scryfall'])}`,
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
