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
    // Fetch last-run timestamps from app_config keys (only the 3 essential jobs)
    async function load() {
      try {
        const q = ['/api/admin/config?key=job:last:bulk_scryfall','key=job:last:bulk_price_import','key=job:last:price_snapshot_bulk'].join('&');
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
      <div className="text-xl font-semibold">Data & Pricing - Consolidated Jobs</div>
      <ELI5 heading="Simplified Cache Management (3 Essential Jobs)" items={[
        '🎯 CONSOLIDATION: Reduced from 6 jobs to 3 essential ones for simplicity and reliability',
        '🔍 Card Lookup: Check individual card cache data (manual tool below)',
        '🔄 Refresh Cache: Force-update a specific card if data is stale',
        '🤖 AUTOMATED: All 3 jobs run nightly at 2 AM UTC via GitHub Actions',
        '📊 Job 1: Bulk Scryfall Import - ALL 110k+ cards metadata (images, rarity, types)',
        '💰 Job 2: Bulk Price Import - Live prices for ALL cached cards',
        '📈 Job 3: Weekly FULL Snapshot - Historical price tracking for charts',
        '⏱️ Total nightly runtime: ~10-15 minutes for complete data refresh',
        '💡 Each job shows when it last ran successfully below'
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

      {/* Essential Jobs Monitor (3 consolidated jobs) */}
      <section className="rounded border border-neutral-800 p-3 space-y-3">
        <div className="font-medium">Essential Jobs Monitor (3 Jobs) <HelpTip text="Consolidated to 3 essential jobs that run automatically nightly via GitHub Actions. Manual triggers available for testing or emergency updates." /></div>
        
        <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mb-4">
          <div className="text-sm text-blue-200 space-y-1">
            <div className="font-semibold">🤖 Automated Nightly Schedule (GitHub Actions)</div>
            <div>• Runs every night at 2:00 AM UTC</div>
            <div>• All 3 jobs run in sequence automatically</div>
            <div>• Total runtime: ~10-15 minutes</div>
            <div>• You can also trigger manually below for testing</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded border border-yellow-800 bg-yellow-900/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-lg">🎨 Job 1: Bulk Scryfall Import (LOCAL ONLY)</div>
              <button
                onClick={async () => {
                  const { toast } = await import('@/lib/toast-client');
                  
                  try {
                    toast('🚀 Starting bulk Scryfall import on Render... (this takes 3-5 minutes)', 'info');
                    
                    const response = await fetch('/api/admin/trigger-bulk-scryfall', {
                      method: 'POST',
                    });
                    
                    const data = await response.json();
                    
                    if (data.ok) {
                      toast(`✅ Success! ${data.message}. Processed ${data.processed || 'N/A'} cards, inserted ${data.inserted || 'N/A'}. Refreshing page...`, 'success');
                      
                      // Refresh after 3 seconds to show new "last run" time
                      setTimeout(() => {
                        window.location.reload();
                      }, 3000);
                    } else {
                      toast(`❌ Failed: ${data.error}`, 'error');
                    }
                  } catch (e: any) {
                    console.error('Bulk Scryfall error:', e);
                    toast(`❌ Error: ${e.message}`, 'error');
                  }
                }}
                className="text-xs text-yellow-400 border border-yellow-600 bg-yellow-900/20 px-3 py-1.5 rounded hover:bg-yellow-900/40 transition-colors cursor-pointer font-semibold"
              >
                🚀 RUN NOW (Render.com)
              </button>
            </div>
            <div className="mt-3 text-sm text-neutral-300 space-y-1">
              <div className="font-semibold text-yellow-300">⚠️ IMPORTANT:</div>
              <div className="text-yellow-200">This job requires ~100MB RAM to process the bulk JSON. Button triggers the job on Render.com (may take 3-5 minutes).</div>
              
              <div className="font-semibold text-purple-300 mt-2">What it does:</div>
              <div>Downloads ALL 110,000+ Magic cards from Scryfall with complete metadata including card images, oracle text, card types, rarity, set information, and collector numbers.</div>
              
              <div className="font-semibold text-purple-300 mt-2">Database table:</div>
              <div><code className="bg-black/40 px-1 rounded">scryfall_cache</code> - Updates metadata fields (NOT prices)</div>
              
              <div className="font-semibold text-purple-300 mt-2">Why it's needed:</div>
              <div>• Required for "Cost to Finish" rarity charts to work</div>
              <div>• Provides card images for all site features</div>
              <div>• Ensures card type/color data is accurate</div>
              
              <div className="font-semibold text-purple-300 mt-2">How to start the local server:</div>
              <div className="bg-black/40 p-2 rounded font-mono text-xs mt-1">
                <div># Open PowerShell in your project folder:</div>
                <div>cd C:\Users\davy_\mtg_ai_assistant\backend</div>
                <div>cd bulk-jobs-server</div>
                <div>npm start</div>
                <div className="mt-1"># Then click the button above! 👆</div>
              </div>
              
              <div className="font-semibold text-purple-300 mt-2">Runtime & Schedule:</div>
              <div>• Takes ~3-5 minutes (downloads ~100MB)</div>
              <div>• ❌ NOT in automated schedule - run manually MONTHLY (or when new sets release)</div>
              <div>• 💡 Check MTG release calendar or Scryfall's sets page</div>
              
              <div className="font-semibold text-purple-300 mt-2">Last successful run:</div>
              <div className="text-white font-mono">{fmt(lastRun['job:last:bulk_scryfall'])}</div>
            </div>
          </div>

          <div className="rounded border border-green-800 bg-green-900/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-lg">💰 Job 2: Bulk Price Import</div>
              <button 
                onClick={()=>runCron('https://mtg-bulk-jobs.onrender.com/bulk-price-import', true)} 
                disabled={busy}
                className="px-4 py-2 rounded border border-green-700 bg-green-900/50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-800/50"
              >
                {busy && currentOperation === 'bulk-price-import' ? '🔄 Running...' : 'Manual Run'}
              </button>
            </div>
            <div className="mt-3 text-sm text-neutral-300 space-y-1">
              <div className="font-semibold text-green-300">What it does:</div>
              <div>🔄 LIGHTWEIGHT: Checks price_cache for stale prices (&gt;24hrs old), fetches fresh prices from Scryfall API (75 cards/batch), updates max 1000 cards per run. NO bulk download!</div>
              
              <div className="font-semibold text-green-300 mt-2">Database table:</div>
              <div><code className="bg-black/40 px-1 rounded">price_cache</code> - Updates price fields (card_name, usd_price, eur_price, etc.)</div>
              
              <div className="font-semibold text-green-300 mt-2">Why it's needed:</div>
              <div>• Powers deck valuations on individual deck pages</div>
              <div>• Required for "Cost to Finish" shopping lists</div>
              <div>• Shows accurate prices across the entire site</div>
              <div>• Keeps price_cache up to date incrementally</div>
              
              <div className="font-semibold text-green-300 mt-2">Runtime & Schedule:</div>
              <div>• Takes ~2-3 minutes (lightweight API calls only)</div>
              <div>• Runs nightly at 2:00 AM UTC via GitHub Actions</div>
              <div>• 🆓 Hosted on Render FREE tier</div>
              
              <div className="font-semibold text-green-300 mt-2">Last successful run:</div>
              <div className="text-white font-mono">{fmt(lastRun['job:last:bulk_price_import'])}</div>
            </div>
          </div>

          <div className="rounded border border-blue-800 bg-blue-900/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-lg">📈 Job 3: Historical Price Snapshots</div>
              <button 
                onClick={()=>runCron('https://mtg-bulk-jobs.onrender.com/price-snapshot', true)} 
                disabled={busy}
                className="px-4 py-2 rounded border border-blue-700 bg-blue-900/50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-800/50"
              >
                {busy && currentOperation === 'bulk' ? '🔄 Running...' : 'Manual Run'}
              </button>
            </div>
            <div className="mt-3 text-sm text-neutral-300 space-y-1">
              <div className="font-semibold text-blue-300">What it does:</div>
              <div>🔄 LIGHTWEIGHT: Reads existing prices from price_cache, creates snapshot rows in price_snapshots table (USD + EUR) with today's date. NO bulk download!</div>
              
              <div className="font-semibold text-blue-300 mt-2">Database table:</div>
              <div><code className="bg-black/40 px-1 rounded">price_snapshots</code> - Historical price data (snapshot_date, name_norm, currency, unit)</div>
              
              <div className="font-semibold text-blue-300 mt-2">Why it's needed:</div>
              <div>• Powers price history charts and graphs</div>
              <div>• Tracks price trends over time</div>
              <div>• Enables "Price Movers" features</div>
              <div>• Supports price spike detection</div>
              
              <div className="font-semibold text-blue-300 mt-2">Runtime & Schedule:</div>
              <div>• Takes ~1-2 minutes (reads from price_cache, no API calls)</div>
              <div>• Runs nightly at 2:05 AM UTC via GitHub Actions (after price refresh)</div>
              <div>• 🆓 Hosted on Render FREE tier</div>
              
              <div className="font-semibold text-blue-300 mt-2">Dependencies:</div>
              <div>⚠️ Depends on price_cache being populated (Job 2 runs first)</div>
              
              <div className="font-semibold text-blue-300 mt-2">Last successful run:</div>
              <div className="text-white font-mono">{fmt(lastRun['job:last:price_snapshot_bulk'])}</div>
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
