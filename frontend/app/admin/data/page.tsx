'use client';
import React from 'react';
import { ELI5, HelpTip } from '@/components/AdminHelp';
import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';

export default function DataPage(){
  const [name, setName] = React.useState('');
  const [row, setRow] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [currentOperation, setCurrentOperation] = React.useState<string>('');
  const [progress, setProgress] = React.useState(0);
  const [lastRun, setLastRun] = React.useState<Record<string, string|undefined>>({});
  const [diagnosticResult, setDiagnosticResult] = React.useState<any>(null);
  const [diagnosticLoading, setDiagnosticLoading] = React.useState(false);
  const [cleanupResult, setCleanupResult] = React.useState<any>(null);
  const { user } = useAuth();
  const { isPro } = useProStatus();

  React.useEffect(() => {
    // Fetch last-run timestamps from app_config keys (only the 3 essential jobs)
    async function load() {
      try {
        const r = await fetch('/api/admin/config?key=job:last:bulk_scryfall&key=job:last:bulk_price_import&key=job:last:price_snapshot_bulk', { cache: 'no-store' });
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
                    // Track UI click
                    track('ui_click', {
                      area: 'admin',
                      action: 'run_job',
                      job: 'bulk-scryfall',
                    }, {
                      userId: user?.id || null,
                      isPro: isPro,
                    });
                    
                    toast('🚀 Starting bulk Scryfall import... (check console for progress)', 'info');
                    
                    const response = await fetch('/api/cron/bulk-scryfall', {
                      method: 'POST',
                    });
                    
                    const data = await response.json();
                    
                    if (data.ok) {
                      toast(`✅ Import complete! Imported ${data.imported || 0} cards (${data.processed || 0} processed). Refreshing...`, 'success');
                      
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
                🚀 RUN NOW
              </button>
            </div>
            <div className="mt-3 text-sm text-neutral-300 space-y-1">
              <div className="font-semibold text-yellow-300">✅ How it works:</div>
              <div className="text-yellow-200">Runs directly in your localhost:3000 Next.js server. Watch console logs for progress!</div>
              
              <div className="font-semibold text-purple-300 mt-2">What it does:</div>
              <div>Downloads ALL 110,000+ Magic cards from Scryfall with complete metadata including card images, oracle text, card types, rarity, set information, and collector numbers.</div>
              
              <div className="font-semibold text-purple-300 mt-2">Database table:</div>
              <div><code className="bg-black/40 px-1 rounded">scryfall_cache</code> - Updates metadata fields (NOT prices)</div>
              
              <div className="font-semibold text-purple-300 mt-2">Why it's needed:</div>
              <div>• Required for "Cost to Finish" rarity charts to work</div>
              <div>• Provides card images for all site features</div>
              <div>• Ensures card type/color data is accurate</div>
              
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
              <div className="font-medium text-lg">💰 Job 2: Bulk Price Import (LOCAL)</div>
              <button
                onClick={async () => {
                  const { toast } = await import('@/lib/toast-client');
                  
                  try {
                    // Track UI click
                    track('ui_click', {
                      area: 'admin',
                      action: 'run_job',
                      job: 'bulk-price-import',
                    }, {
                      userId: user?.id || null,
                      isPro: isPro,
                    });
                    
                    toast('💰 Starting bulk price import... (check console for progress)', 'info');
                    
                    const response = await fetch('/api/cron/bulk-price-import', {
                      method: 'POST',
                    });
                    
                    const data = await response.json();
                    
                    if (data.ok) {
                      toast(`✅ Import complete! Updated ${data.updated || 0} prices (${data.unique_cards_with_prices || 0} unique cards, ${data.coverage_percent || 0}% coverage). Refreshing...`, 'success');
                      
                      // Refresh after 3 seconds to show new "last run" time
                      setTimeout(() => {
                        window.location.reload();
                      }, 3000);
                    } else {
                      toast(`❌ Failed: ${data.error}`, 'error');
                    }
                    
                  } catch (e: any) {
                    console.error('Bulk price import error:', e);
                    toast(`❌ Error: ${e.message}`, 'error');
                  }
                }}
                className="text-xs text-green-400 border border-green-700 bg-green-900/50 px-3 py-1.5 rounded hover:bg-green-800/50 transition-colors cursor-pointer font-semibold"
              >
                🚀 RUN NOW
              </button>
            </div>
            <div className="mt-3 text-sm text-neutral-300 space-y-1">
              <div className="font-semibold text-green-300">✅ How it works:</div>
              <div className="text-green-200">Runs directly in your localhost:3000 Next.js server. Watch console logs for progress!</div>
              
              <div className="font-semibold text-green-300 mt-2">What it does:</div>
              <div>🔄 Downloads bulk card data from Scryfall, extracts prices for all cards in your scryfall_cache, and updates the price_cache table with live USD, EUR, foil, and MTGO ticket prices.</div>
              
              <div className="font-semibold text-green-300 mt-2">Database table:</div>
              <div><code className="bg-black/40 px-1 rounded">price_cache</code> - Updates price fields (card_name, usd_price, eur_price, etc.)</div>
              
              <div className="font-semibold text-green-300 mt-2">Why it's needed:</div>
              <div>• Powers deck valuations on individual deck pages</div>
              <div>• Required for "Cost to Finish" shopping lists</div>
              <div>• Shows accurate prices across the entire site</div>
              <div>• Keeps price_cache up to date incrementally</div>
              
              <div className="font-semibold text-green-300 mt-2">Runtime & Schedule:</div>
              <div>• Takes ~3-5 minutes (downloads ~100MB bulk data)</div>
              <div>• Runs nightly at 2:00 AM UTC via GitHub Actions</div>
              <div>• Also runs locally on demand via this button</div>
              
              <div className="font-semibold text-green-300 mt-2">Last successful run:</div>
              <div className="text-white font-mono">{fmt(lastRun['job:last:bulk_price_import'])}</div>
            </div>
          </div>

          <div className="rounded border border-blue-800 bg-blue-900/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-lg">📈 Job 3: Historical Price Snapshots (LOCAL)</div>
              <button
                onClick={async () => {
                  const { toast } = await import('@/lib/toast-client');
                  
                  try {
                    toast('📈 Starting price snapshot... (check console for progress)', 'info');
                    
                    // Use bulk snapshot endpoint that processes ALL cards (not just deck cards)
                    const response = await fetch('/api/bulk-jobs/price-snapshot', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    });
                    
                    const data = await response.json();
                    
                    if (data.ok) {
                      toast(`✅ Snapshot complete! Inserted ${data.inserted || 0} historical price records for ${data.snapshot_date || 'today'}. Refreshing...`, 'success');
                      
                      // Refresh after 3 seconds to show new "last run" time
                      setTimeout(() => {
                        window.location.reload();
                      }, 3000);
                    } else {
                      toast(`❌ Failed: ${data.error}`, 'error');
                    }
                    
                  } catch (e: any) {
                    console.error('Price snapshot error:', e);
                    toast(`❌ Error: ${e.message}`, 'error');
                  }
                }}
                className="text-xs text-blue-400 border border-blue-700 bg-blue-900/50 px-3 py-1.5 rounded hover:bg-blue-800/50 transition-colors cursor-pointer font-semibold"
              >
                🚀 RUN NOW
              </button>
            </div>
            <div className="mt-3 text-sm text-neutral-300 space-y-1">
              <div className="font-semibold text-blue-300">✅ How it works:</div>
              <div className="text-blue-200">Runs directly in your localhost:3000 Next.js server. Watch console logs for progress!</div>
              
              <div className="font-semibold text-blue-300 mt-2">What it does:</div>
              <div>🔄 Creates price snapshots for ALL 110,000+ cards from price_cache, then creates snapshot rows in price_snapshots table with today's date (USD, EUR, and GBP). This enables price history tracking for ANY card users search on the price tracker page.</div>
              
              <div className="font-semibold text-blue-300 mt-2">Database table:</div>
              <div><code className="bg-black/40 px-1 rounded">price_snapshots</code> - Historical price data (snapshot_date, name_norm, currency, unit)</div>
              
              <div className="font-semibold text-blue-300 mt-2">Why it's needed:</div>
              <div>• Powers price history charts and graphs</div>
              <div>• Tracks price trends over time</div>
              <div>• Enables "Price Movers" features</div>
              <div>• Supports price spike detection</div>
              
              <div className="font-semibold text-blue-300 mt-2">Runtime & Schedule:</div>
              <div>• Takes ~2-3 minutes (fetches live prices from Scryfall)</div>
              <div>• Runs nightly at 2:05 AM UTC via GitHub Actions (after price refresh)</div>
              <div>• Also runs locally on demand via this button</div>
              
              <div className="font-semibold text-blue-300 mt-2">Dependencies:</div>
              <div>⚠️ Requires deck_cards table to be populated with card names</div>
              
              <div className="font-semibold text-blue-300 mt-2">Last successful run:</div>
              <div className="text-white font-mono">{fmt(lastRun['job:last:price_snapshot_bulk'])}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Database Size Management */}
      <section className="rounded border border-neutral-800 p-3 space-y-4">
        <div className="font-medium text-lg">Database Size Management <HelpTip text="Diagnostic tools and cleanup functions to reduce database size and stay within Supabase Free Plan limits (0.5 GB)." /></div>
        <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mb-4">
          <div className="text-sm text-blue-200 space-y-1">
            <div className="font-semibold">🛡️ Safety Reminder</div>
            <div>✅ Supabase automatically backs up daily (7-day retention on free tier)</div>
            <div>✅ All cleanup functions show previews before deletion</div>
            <div>⚠️ Review <code className="bg-black/40 px-1 rounded">docs/DATABASE_CLEANUP_RISKS.md</code> for detailed risk assessment</div>
            <div>💡 Start with "Analyze Database Sizes" (100% safe) to understand current state</div>
          </div>
        </div>
        
        {/* Diagnostic Tool */}
        <div className="rounded border border-cyan-800 bg-cyan-900/10 p-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="font-medium">Analyze Database Sizes</div>
            <button
              onClick={async () => {
                setDiagnosticLoading(true);
                setDiagnosticResult(null);
                try {
                  const { toast } = await import('@/lib/toast-client');
                  toast('Analyzing database sizes...', 'info');
                  
                  const response = await fetch('/api/admin/data/table-sizes');
                  const data = await response.json();
                  
                  if (data.ok) {
                    setDiagnosticResult(data);
                    toast('Analysis complete!', 'success');
                  } else {
                    toast(`Analysis failed: ${data.error}`, 'error');
                  }
                } catch (e: any) {
                  console.error('Diagnostic error:', e);
                  alert(`Error: ${e.message}`);
                } finally {
                  setDiagnosticLoading(false);
                }
              }}
              disabled={diagnosticLoading}
              className="text-xs text-cyan-400 border border-cyan-600 bg-cyan-900/20 px-3 py-1.5 rounded hover:bg-cyan-900/40 disabled:opacity-60 transition-colors cursor-pointer font-semibold"
            >
              {diagnosticLoading ? 'Analyzing...' : 'Run Analysis'}
            </button>
          </div>
          
          {diagnosticResult && (
            <div className="mt-4 space-y-4 text-sm">
              {/* Table Sizes */}
              {diagnosticResult.tables && diagnosticResult.tables.length > 0 && (
                <div>
                  <div className="font-semibold mb-2">Table Sizes (Estimated):</div>
                  <div className="bg-black/40 rounded p-2 max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-700">
                          <th className="text-left py-1">Table</th>
                          <th className="text-right py-1">Rows</th>
                          <th className="text-right py-1">Est. Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnosticResult.tables.slice(0, 15).map((t: any) => (
                          <tr key={t.name} className="border-b border-neutral-800">
                            <td className="py-1 font-mono">{t.name}</td>
                            <td className="text-right py-1">{t.row_count?.toLocaleString() || '—'}</td>
                            <td className="text-right py-1">{t.total_size_mb !== null ? `${t.total_size_mb} MB` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Scryfall Cache Analysis */}
              {diagnosticResult.scryfall_cache_analysis && (
                <div>
                  <div className="font-semibold mb-2">Scryfall Cache Column Analysis:</div>
                  <div className="bg-black/40 rounded p-2 text-xs space-y-1">
                    <div>Sample size: {diagnosticResult.scryfall_cache_analysis.sample_size.toLocaleString()} rows</div>
                    <div>Oracle text: avg {diagnosticResult.scryfall_cache_analysis.oracle_text.avg_length} chars, {diagnosticResult.scryfall_cache_analysis.oracle_text.rows_over_500_chars} rows &gt;500 chars</div>
                    <div>Normal images: {diagnosticResult.scryfall_cache_analysis.normal.rows_with_url.toLocaleString()} rows</div>
                  </div>
                </div>
              )}

              {/* Price Snapshots Analysis */}
              {diagnosticResult.price_snapshots_analysis && (
                <div>
                  <div className="font-semibold mb-2">Price Snapshots Analysis:</div>
                  <div className="bg-black/40 rounded p-2 text-xs space-y-1">
                    <div>Total rows: {diagnosticResult.price_snapshots_analysis.total_rows.toLocaleString()}</div>
                    <div>Date range: {diagnosticResult.price_snapshots_analysis.oldest_date} to {diagnosticResult.price_snapshots_analysis.newest_date}</div>
                    <div>Days span: {diagnosticResult.price_snapshots_analysis.days_span} days</div>
                    <div>Est. rows per day: {diagnosticResult.price_snapshots_analysis.estimated_rows_per_day.toLocaleString()}</div>
                  </div>
                </div>
              )}

              {/* Logs */}
              {diagnosticResult.logs && diagnosticResult.logs.length > 0 && (
                <details className="bg-black/40 rounded p-2">
                  <summary className="font-semibold cursor-pointer text-xs">View Detailed Logs ({diagnosticResult.logs.length} entries)</summary>
                  <pre className="mt-2 text-xs overflow-auto max-h-48 font-mono">{diagnosticResult.logs.join('\n')}</pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Price Snapshot Cleanup */}
        <div className="rounded border border-red-800 bg-red-900/10 p-3">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="font-medium">Cleanup Price Snapshots (60 days)</div>
            <button
              onClick={async () => {
                // Double confirmation with backup reminder
                const confirm1 = confirm(`⚠️ WARNING: This will delete price snapshots older than 60 days.\n\nThis action cannot be undone, but:\n✅ Supabase has daily backups (7-day retention)\n✅ Historical price charts will lose data beyond 60 days\n✅ Current prices are NOT affected\n\nContinue?`);
                if (!confirm1) return;
                
                const confirm2 = confirm(`Final confirmation: Delete price snapshots older than 60 days?\n\nThis is irreversible. Make sure you have a recent backup if you might need to restore.\n\nProceed with deletion?`);
                if (!confirm2) return;
                
                setBusy(true);
                setCleanupResult(null);
                try {
                  const { toast } = await import('@/lib/toast-client');
                  toast('Cleaning up price snapshots...', 'info');
                  
                  const response = await fetch('/api/admin/data/cleanup-snapshots', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ days: 60 })
                  });
                  
                  const data = await response.json();
                  setCleanupResult(data);
                  
                  if (data.ok) {
                    toast(`✅ Cleanup complete! Deleted ${data.deleted.toLocaleString()} rows (~${data.estimated_space_freed_mb} MB)`, 'success');
                  } else {
                    toast(`❌ Cleanup failed: ${data.error}`, 'error');
                  }
                } catch (e: any) {
                  console.error('Cleanup error:', e);
                  alert(`Error: ${e.message}`);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="text-xs text-red-400 border border-red-600 bg-red-900/20 px-3 py-1.5 rounded hover:bg-red-900/40 disabled:opacity-60 transition-colors cursor-pointer font-semibold"
            >
              {busy ? 'Cleaning...' : 'Run Cleanup'}
            </button>
          </div>

          {cleanupResult && (
            <div className="mt-4 space-y-2 text-sm">
              {cleanupResult.ok ? (
                <div className="bg-green-900/20 border border-green-800 rounded p-3 text-xs space-y-1">
                  <div className="font-semibold text-green-300">✅ Cleanup Complete</div>
                  <div>Deleted: {cleanupResult.deleted.toLocaleString()} rows</div>
                  <div>Total before: {cleanupResult.total_before.toLocaleString()}</div>
                  <div>Total after: {cleanupResult.total_after.toLocaleString()}</div>
                  <div>Estimated space freed: ~{cleanupResult.estimated_space_freed_mb} MB</div>
                  <div>Cutoff date: {cleanupResult.cutoff_date}</div>
                  {cleanupResult.logs && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-green-200">View Logs</summary>
                      <pre className="mt-2 text-xs overflow-auto max-h-32 font-mono">{cleanupResult.logs.join('\n')}</pre>
                    </details>
                  )}
                </div>
              ) : (
                <div className="bg-red-900/20 border border-red-800 rounded p-3 text-xs">
                  <div className="font-semibold text-red-300">❌ Error: {cleanupResult.error}</div>
                  {cleanupResult.logs && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-red-200">View Logs</summary>
                      <pre className="mt-2 text-xs overflow-auto max-h-32 font-mono">{cleanupResult.logs.join('\n')}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Manual Optimization Functions */}
      <section className="rounded border border-neutral-800 p-3 space-y-4">
        <div className="font-medium text-lg">Manual Optimization Functions <HelpTip text="Tools to optimize database tables. Use these manually when needed to reduce database size." /></div>
        
        {/* Scryfall Cache Optimization */}
        <div className="rounded border border-purple-800 bg-purple-900/10 p-3">
          <div className="font-medium mb-3">Scryfall Cache Optimization</div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={async () => {
                try {
                  const { toast } = await import('@/lib/toast-client');
                  toast('Analyzing scryfall_cache...', 'info');
                  
                  const response = await fetch('/api/admin/data/optimize-scryfall-cache', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'analyze' })
                  });
                  
                  const data = await response.json();
                  
                  if (data.ok) {
                    alert(`Analysis complete!\n\nOracle text: ${data.analysis.oracle_text.rows_with_text.toLocaleString()} rows with text\nAvg length: ${data.analysis.oracle_text.avg_length} chars\nRows >500 chars: ${data.analysis.oracle_text.rows_over_threshold}\n\nRecommendations:\n${data.recommendations.oracle_text_truncation}`);
                    console.log('Full analysis:', data);
                  } else {
                    toast(`Analysis failed: ${data.error}`, 'error');
                  }
                } catch (e: any) {
                  alert(`Error: ${e.message}`);
                }
              }}
              className="text-xs text-purple-400 border border-purple-600 bg-purple-900/20 px-3 py-1.5 rounded hover:bg-purple-900/40 transition-colors cursor-pointer"
            >
              Analyze Cache
            </button>
            <button
              onClick={async () => {
                if (!confirm('Optimize scryfall_cache by truncating long oracle_text fields? This may take a few minutes.')) return;
                try {
                  const { toast } = await import('@/lib/toast-client');
                  toast('Optimizing scryfall_cache...', 'info');
                  
                  const response = await fetch('/api/admin/data/optimize-scryfall-cache', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'optimize', oracle_text_threshold: 500 })
                  });
                  
                  const data = await response.json();
                  
                  if (data.ok) {
                    toast(`✅ Optimized ${data.rows_optimized.toLocaleString()} rows (~${data.estimated_space_saved_mb} MB saved)`, 'success');
                    console.log('Optimization logs:', data.logs);
                  } else {
                    toast(`❌ Optimization failed: ${data.error}`, 'error');
                  }
                } catch (e: any) {
                  alert(`Error: ${e.message}`);
                }
              }}
              className="text-xs text-purple-400 border border-purple-600 bg-purple-900/20 px-3 py-1.5 rounded hover:bg-purple-900/40 transition-colors cursor-pointer"
            >
              Optimize Cache
            </button>
          </div>
        </div>

        {/* VACUUM ANALYZE */}
        <div className="rounded border border-indigo-800 bg-indigo-900/10 p-3">
          <div className="font-medium mb-3">VACUUM ANALYZE (Manual SQL Required)</div>
          <div className="text-xs text-neutral-400 mb-2">
            VACUUM ANALYZE requires direct SQL access. Use Supabase SQL Editor to run:
          </div>
          <div className="bg-black/40 rounded p-2 font-mono text-xs mb-2">
            VACUUM ANALYZE scryfall_cache;
          </div>
          <div className="text-xs text-neutral-400">
            Or run on all tables: <code className="bg-black/40 px-1 rounded">VACUUM ANALYZE;</code>
          </div>
        </div>
      </section>

      {/* Other Table Cleanups */}
      <section className="rounded border border-neutral-800 p-3 space-y-4">
        <div className="font-medium text-lg">Other Table Cleanups <HelpTip text="Cleanup functions for audit logs and abandoned accounts. Use these manually when needed." /></div>
        
        {/* Audit Logs Cleanup */}
        <div className="rounded border border-orange-800 bg-orange-900/10 p-3">
          <div className="font-medium mb-3">Audit Logs Cleanup</div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={async () => {
                if (!confirm('Delete admin_audit entries older than 90 days?')) return;
                try {
                  const { toast } = await import('@/lib/toast-client');
                  toast('Cleaning up admin_audit...', 'info');
                  
                  const response = await fetch('/api/admin/data/cleanup-audit-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ table_name: 'admin_audit', retention_days: 90 })
                  });
                  
                  const data = await response.json();
                  
                  if (data.ok) {
                    toast(`✅ Deleted ${data.deleted.toLocaleString()} rows (~${data.estimated_space_freed_mb} MB)`, 'success');
                    console.log('Cleanup logs:', data.logs);
                  } else {
                    toast(`❌ Failed: ${data.error}`, 'error');
                  }
                } catch (e: any) {
                  alert(`Error: ${e.message}`);
                }
              }}
              className="text-xs text-orange-400 border border-orange-600 bg-orange-900/20 px-3 py-1.5 rounded hover:bg-orange-900/40 transition-colors cursor-pointer"
            >
              Cleanup Audit Logs (90 days)
            </button>
            <button
              onClick={async () => {
                if (!confirm('Delete error_logs entries older than 30 days?')) return;
                try {
                  const { toast } = await import('@/lib/toast-client');
                  toast('Cleaning up error_logs...', 'info');
                  
                  const response = await fetch('/api/admin/data/cleanup-audit-logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ table_name: 'error_logs', retention_days: 30 })
                  });
                  
                  const data = await response.json();
                  
                  if (data.ok) {
                    toast(`✅ Deleted ${data.deleted.toLocaleString()} rows (~${data.estimated_space_freed_mb} MB)`, 'success');
                    console.log('Cleanup logs:', data.logs);
                  } else {
                    toast(`❌ Failed: ${data.error}`, 'error');
                  }
                } catch (e: any) {
                  alert(`Error: ${e.message}`);
                }
              }}
              className="text-xs text-orange-400 border border-orange-600 bg-orange-900/20 px-3 py-1.5 rounded hover:bg-orange-900/40 transition-colors cursor-pointer"
            >
              Cleanup Error Logs (30 days)
            </button>
          </div>
        </div>

        {/* Abandoned Accounts */}
        <div className="rounded border border-pink-800 bg-pink-900/10 p-3">
          <div className="font-medium mb-3">🚨 Abandoned Accounts (HIGH RISK)</div>
          <div className="text-xs text-red-400 mb-2 bg-red-900/20 border border-red-800 rounded p-2">
            ⚠️ <strong>HIGH RISK OPERATION</strong>: Account deletion is permanent and affects all user data (decks, collections, chats). 
            Always use "Find" mode first to preview accounts before deletion. Ensure you have recent backups.
          </div>
          <div className="flex gap-2 flex-wrap">
          <button
            onClick={async () => {
              try {
                const { toast } = await import('@/lib/toast-client');
                toast('Finding abandoned accounts...', 'info');
                
                const response = await fetch('/api/admin/data/cleanup-abandoned-accounts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'find', inactive_days: 365 })
                });
                
                const data = await response.json();
                
                if (data.ok) {
                  const message = data.total_abandoned > 0
                    ? `Found ${data.total_abandoned.toLocaleString()} abandoned accounts.\n\nFirst 10:\n${data.account_preview.slice(0, 10).map((a: any) => `${a.email} (last sign in: ${a.last_sign_in_at})`).join('\n')}\n\nSee console for full list and use action='delete' to remove.`
                    : 'No abandoned accounts found.';
                  alert(message);
                  console.log('Full abandoned accounts data:', data);
                } else {
                  toast(`Failed: ${data.error}`, 'error');
                }
              } catch (e: any) {
                alert(`Error: ${e.message}`);
              }
            }}
            className="text-xs text-pink-400 border border-pink-600 bg-pink-900/20 px-3 py-1.5 rounded hover:bg-pink-900/40 transition-colors cursor-pointer"
          >
            🔍 Find (Safe - Preview Only)
          </button>
          <button
            onClick={async () => {
              // Triple confirmation for account deletion
              const confirm1 = confirm(`🚨 CRITICAL WARNING: This will PERMANENTLY DELETE user accounts and ALL their data:\n\n❌ User account\n❌ All decks\n❌ All collections\n❌ All chat history\n❌ All wishlists\n❌ All custom cards\n\nThis is IRREVERSIBLE without backups!\n\nHave you verified your Supabase backup is recent?`);
              if (!confirm1) return;
              
              const confirm2 = confirm(`⚠️ Double confirmation: Delete abandoned accounts (1+ year inactive)?\n\nThis cannot be undone. All user data will be permanently lost.\n\nContinue?`);
              if (!confirm2) return;
              
              const confirm3 = confirm(`🚨 FINAL WARNING: This is your last chance to cancel.\n\nAccounts will be permanently deleted.\n\nType OK to confirm, or Cancel to abort.`);
              if (confirm3 !== true) return; // Just extra safety
              
              try {
                const { toast } = await import('@/lib/toast-client');
                toast('⚠️ DELETING abandoned accounts - this may take several minutes...', 'warning');
                
                const response = await fetch('/api/admin/data/cleanup-abandoned-accounts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'delete', inactive_days: 365 })
                });
                
                const data = await response.json();
                
                if (data.ok) {
                  toast(`⚠️ Deleted ${data.deleted.toLocaleString()} accounts (${data.errors} errors). This cannot be undone!`, 'warning');
                  console.log('Deletion logs:', data.logs);
                } else {
                  toast(`❌ Deletion failed: ${data.error}`, 'error');
                }
              } catch (e: any) {
                alert(`Error: ${e.message}`);
              }
            }}
            className="text-xs text-red-400 border-2 border-red-600 bg-red-900/30 px-3 py-1.5 rounded hover:bg-red-900/50 transition-colors cursor-pointer font-bold"
          >
            ⚠️ DELETE (DANGER - Irreversible!)
          </button>
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
