"use client";
import React from "react";
import CardRowPreviewLeft from "@/components/shared/CardRowPreview";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { usePro as useProContext } from "@/components/ProContext";

async function fetchCardMeta(names: string[]): Promise<Record<string, { small?: string; large?: string; set?: string; rarity?: string }>>{
  const out: Record<string, { small?: string; large?: string; set?: string; rarity?: string }> = {};
  const unique = Array.from(new Set(names.filter(Boolean)));
  for (const n of unique){
    try{
      const r = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}`);
      if(!r.ok) continue; const j = await r.json();
      out[n.toLowerCase()] = {
        small: j?.image_uris?.small || j?.card_faces?.[0]?.image_uris?.small,
        large: j?.image_uris?.large || j?.card_faces?.[0]?.image_uris?.large,
        set: j?.set,
        rarity: j?.rarity,
      };
    } catch{}
  }
  return out;
}

export default function BudgetSwapsClient(){
  const { isPro } = useProContext();

  const [deckId, setDeckId] = React.useState("");
  const [deckText, setDeckText] = React.useState("");
  const [currency, setCurrency] = React.useState<'USD'|'EUR'|'GBP'>("GBP");
  const [threshold, setThreshold] = React.useState<number>(5);
  const [topX, setTopX] = React.useState<number>(5);
  const [mode, setMode] = React.useState<'strict'|'ai'>("strict");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string|undefined>(undefined);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [isProLocal, setIsProLocal] = React.useState(false);

  type Sug = { from:string; to:string; price_from:number; price_to:number; price_delta:number; rationale?:string; confidence?:number };
  const [sugs, setSugs] = React.useState<Sug[]>([]);
  const [meta, setMeta] = React.useState<Record<string, { small?: string; large?: string; set?: string; rarity?: string }>>({});
  const [decks, setDecks] = React.useState<Array<{ id:string; title:string }>>([]);
  const [whyMap, setWhyMap] = React.useState<Record<string, string>>({});
  const [whyBusy, setWhyBusy] = React.useState<Record<string, boolean>>({});

  React.useEffect(()=>{
    let alive = true;
    (async()=>{
      try{
        const sb = createBrowserSupabaseClient();
        const { data: userRes } = await sb.auth.getUser();
        const uid = userRes?.user?.id; if (!uid) return;
        // detect pro from metadata as fallback if provider not mounted higher up
        try{ const md:any = (userRes?.user as any)?.user_metadata || {}; if (md?.is_pro || md?.pro) setIsProLocal(true); } catch{}
        const { data } = await sb.from('decks').select('id,title').eq('user_id', uid).order('updated_at', { ascending:false }).limit(100);
        if (alive) setDecks((data as any[])?.map(d=>({ id:d.id, title:d.title })) || []);
      } catch{}
    })();
    return ()=>{ alive=false; };
  }, []);

  const isProFinal = isPro || isProLocal;
  const hasResults = sugs.length > 0;

  const compute = async (): Promise<Sug[]|null> => {
    if (mode === 'ai' && !isProFinal){
      try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('AI swaps are a Pro feature.'); }
      return null;
    }
    if (!deckText.trim()) { setError('Please paste your decklist.'); return null; }
    setBusy(true); setError(undefined);
    try{
      const body: any = { deckText, currency, budget: threshold, ai: mode==='ai' };
      const r = await fetch('/api/deck/swap-suggestions', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({ ok:false }));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'Failed');
      const list: Sug[] = Array.isArray(j?.suggestions)? j.suggestions: [];
      const top = list.sort((a,b)=> (a.price_to-a.price_from)-(b.price_to-b.price_from)).slice(0, Math.max(1, topX));
      setSugs(top);
      // Prefetch thumbnails for hover previews
      const names: string[] = [];
      top.forEach(s => { names.push(s.from); names.push(s.to); });
      const m = await fetchCardMeta(names);
      setMeta(m);
      return top;
    } catch(e:any){ setError(e?.message||'Failed'); return null; } finally{ setBusy(false); }
  };


  const savings = React.useMemo(()=>{
    const totalDelta = sugs.reduce((a,s)=> a + (Number(s.price_delta)||0), 0);
    return -Math.min(0, totalDelta);
  }, [sugs]);

  const withinBudget = React.useMemo(()=> sugs.length>0 && sugs.every(s => (s.price_to||0) <= threshold), [sugs, threshold]);

  // Exports
  const exportCSV = () => {
    try{
      const header = ['Original','Price','Suggested','Swap price','Difference'];
      const rows = sugs.map(s => [s.from, s.price_from, s.to, s.price_to, s.price_to - s.price_from]);
      const csv = [header.join(','), ...rows.map(r => r.map(v => typeof v==='string' ? '"'+v.replace(/"/g,'""')+'"' : String(v)).join(','))].join('\r\n');
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='budget_swaps.csv'; a.click(); URL.revokeObjectURL(a.href);
    } catch(e:any){ alert(e?.message||'CSV export failed'); }
  };
  const exportTxt = async (kind:'moxfield'|'mtgo') => {
    if (!isProFinal){ try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature.'); } return; }
    try{
      const lines = Array.from(new Set(sugs.map(s=> s.to))).map(n => `1 ${n}`);
      const blob = new Blob([lines.join('\n')], { type:'text/plain;charset=utf-8' });
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download = kind==='moxfield' ? 'swaps_moxfield.txt' : 'swaps_mtgo.txt'; a.click(); URL.revokeObjectURL(a.href);
    } catch(e:any){ alert(e?.message||'Export failed'); }
  };
  const addToWishlist = async () => {
    try{
      const names = Array.from(new Set(sugs.map(s=> s.to)));
      if (!names.length) return;
      const r = await fetch('/api/wishlists/add', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, qty: 1 }) });
      const j = await r.json().catch(()=>({ ok:false }));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Add failed');
      alert('Added to wishlist');
    } catch(e:any){ alert(e?.message||'Wishlist add failed'); }
  };
  const forkDeck = async () => {
    if (!isProFinal){ try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature.'); } return; }
    // Backend not implemented; show a graceful message for now
    alert('Fork deck with swaps is coming soon!');
  };

  // format currency
  const fmt = (n:number)=> new Intl.NumberFormat(undefined, { style:'currency', currency }).format(Number(n||0));

  return (
    <div className="w-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-[5] bg-neutral-950/85 backdrop-blur border-b border-neutral-800 -mx-4 px-4 py-3">
        <div className="w-full">
          <div className="text-lg font-semibold">Budget Swaps</div>
          <div className="text-[12px] opacity-80">Find cheaper alternatives to your pricey staples — keep your deck’s power without breaking the bank.</div>
          {!isProFinal && (
            <div className="mt-2 text-[11px]"><span className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span> AI swaps, trend sparkline, MTGO/Moxfield exports, and deck forking are Pro features.</div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-12 gap-4 mt-3">
        {/* Left: input form */}
        <aside className="col-span-12 md:col-span-4">
          <div className="rounded-xl border border-neutral-800 p-3 space-y-3">
            <div className="text-sm font-semibold">Input</div>
            <label className="text-xs block">
              <div className="opacity-70 mb-1">Select a Deck</div>
              {decks.length === 0 && (
                <div className="text-xs text-yellow-400 mb-2 italic">
                  Please sign in to select from your saved decks, or paste a decklist below.
                </div>
              )}
              <select value={deckId} onChange={async (e)=>{
                const id = e.target.value; setDeckId(id);
                if (!id) return;
                try{
                  const sb = createBrowserSupabaseClient();
                  const { data } = await sb.from('decks').select('deck_text').eq('id', id).maybeSingle();
                  const text = String((data as any)?.deck_text || '');
                  if (text) setDeckText(text);
                } catch{}
              }} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm">
                <option value="">— None (paste below) —</option>
                {decks.map(d=> <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
            <label className="text-xs block">
              <div className="opacity-70 mb-1">Paste decklist</div>
              <textarea value={deckText} onChange={e=>setDeckText(e.target.value)} rows={8} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm font-mono" placeholder={`1 Sol Ring\n1 Cyclonic Rift`} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                <div className="opacity-70 mb-1">Currency</div>
                <select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm">
                  {(['USD','EUR','GBP'] as const).map(c=> <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-xs">
                <div className="opacity-70 mb-1">Threshold</div>
                <input type="number" min={0} step={0.5} value={threshold} onChange={e=>setThreshold(parseFloat(e.target.value||'0'))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" />
              </label>
              <label className="text-xs">
                <div className="opacity-70 mb-1">Show top X swaps</div>
                <input type="number" min={1} max={50} value={topX} onChange={e=>setTopX(parseInt(e.target.value||'1',10))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm" />
              </label>
              <label className="text-xs">
                <div className="opacity-70 mb-1">Mode</div>
                <div className="flex items-center gap-3 text-sm">
                  <label className="inline-flex items-center gap-1"><input type="radio" checked={mode==='strict'} onChange={()=>setMode('strict')} /> Strict budget</label>
                  <label className="inline-flex items-center gap-1"><input type="radio" checked={mode==='ai'} onChange={()=>setMode('ai')} /> Loose thematic { !isProFinal && (<span className="ml-1 px-1 rounded bg-amber-300 text-black text-[10px]">Pro</span>)}</label>
                </div>
                <div className="mt-1 text-[11px] opacity-70">
                  Strict budget suggests cheaper near-equivalents with similar effects. Loose thematic (AI) looks for cheaper cards that play a similar role/synergy in your deck — not exact copies — so you keep the theme while saving.
                </div>
              </label>
            </div>
            <div className="pt-1">
              <button onClick={compute} disabled={busy} className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-semibold disabled:opacity-60">{busy? 'Computing…' : 'Compute'}</button>
            </div>
          </div>
        </aside>

        {/* Right: results */}
        <section className="col-span-12 md:col-span-8">
          {!hasResults ? (
            <div className="space-y-4">
              <div className="text-sm opacity-70">Paste a deck and click Compute to see budget swap suggestions.</div>
              
              {/* Guest Example - only show when no results and not busy */}
              {!busy && (
                <div className="rounded-xl border border-blue-500/40 bg-blue-950/20 p-4">
                  <div className="text-sm font-semibold mb-3 text-blue-300">👁️ Example Result Preview</div>
                  <div className="text-xs text-neutral-300 mb-3">Here's what Budget Swaps looks like for a sample competitive deck:</div>
                  
                  {/* Mock summary */}
                  <div
                    className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 mb-3 animate-pulse cursor-pointer"
                    onClick={async()=>{ try{ const { toast } = await import('@/lib/toast-client'); toast('Paste your deck to find real budget alternatives','info'); } catch { alert('Paste your deck to find real budget alternatives'); } }}
                  >
                    <div className="text-xs font-medium mb-2 opacity-80">Summary</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="rounded border border-neutral-800 p-2">
                        <div className="opacity-70 text-[10px]">Cards over threshold</div>
                        <div className="font-bold">6</div>
                      </div>
                      <div className="rounded border border-neutral-800 p-2">
                        <div className="opacity-70 text-[10px]">Estimated savings</div>
                        <div className="font-bold text-emerald-400">$89.75</div>
                      </div>
                      <div className="rounded border border-neutral-800 p-2">
                        <div className="opacity-70 text-[10px]">Budget check</div>
                        <div className="font-bold text-emerald-400">✅ Within your $5.00 budget!</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Mock swap table */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                    <div className="text-xs font-medium mb-2 opacity-80">Top Swaps</div>
                    <div className="space-y-2 text-xs">
                      <div
                        className="flex justify-between items-center py-1 border-b border-neutral-800 cursor-pointer hover:bg-neutral-900/40"
                        onClick={async()=>{ try{ const { toast } = await import('@/lib/toast-client'); toast('Paste your deck to find real budget alternatives','info'); } catch { alert('Paste your deck to find real budget alternatives'); } }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-1 py-0.5 bg-red-900/30 rounded text-[10px]">From:</span>
                          <span>Mana Crypt ($45.00)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-1 py-0.5 bg-emerald-900/30 rounded text-[10px]">To:</span>
                          <span>Sol Ring ($2.50)</span>
                          <span className="text-emerald-400">-$42.50</span>
                        </div>
                      </div>
                      <div
                        className="flex justify-between items-center py-1 border-b border-neutral-800 cursor-pointer hover:bg-neutral-900/40"
                        onClick={async()=>{ try{ const { toast } = await import('@/lib/toast-client'); toast('Paste your deck to find real budget alternatives','info'); } catch { alert('Paste your deck to find real budget alternatives'); } }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="px-1 py-0.5 bg-red-900/30 rounded text-[10px]">From:</span>
                          <span>Force of Will ($35.00)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-1 py-0.5 bg-emerald-900/30 rounded text-[10px]">To:</span>
                          <span>Counterspell ($1.25)</span>
                          <span className="text-emerald-400">-$33.75</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="opacity-70">+ 4 more swaps...</span>
                        <span className="text-emerald-400 opacity-70">-$13.50</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-xs opacity-70">💡 Paste your own deck above to find real budget alternatives!</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary card */}
              <div className="rounded-xl border border-neutral-800 p-3">
                <div className="text-sm font-semibold">Summary</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 text-sm">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                    <div className="opacity-70 text-xs">Cards over threshold</div>
                    <div className="text-xl font-semibold">{sugs.length}</div>
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                    <div className="opacity-70 text-xs">Estimated savings</div>
                    <div className="text-xl font-semibold text-emerald-400">{fmt(savings)}</div>
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                    <div className="opacity-70 text-xs">Budget check</div>
                    <div className={`text-sm font-semibold ${withinBudget? 'text-emerald-400':'text-amber-400'}`}>{withinBudget? `✅ Within your ${new Intl.NumberFormat(undefined,{style:'currency', currency}).format(threshold)} budget!` : '⚠️ Some staples remain above threshold.'}</div>
                  </div>
                </div>
              </div>

              {/* Quick actions grouped at bottom of summary */}
              <div className="mt-3 pt-3 border-t border-neutral-800 flex flex-wrap items-center gap-2 text-xs">
                <button onClick={exportCSV} className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800">Export CSV</button>
                <button onClick={()=>exportTxt('moxfield')} className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800">Export → Moxfield { !isProFinal && (<span className="ml-1 px-1 rounded bg-amber-300 text-black text-[10px]">Pro</span>)}</button>
                <button onClick={()=>exportTxt('mtgo')} className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800">Export → MTGO { !isProFinal && (<span className="ml-1 px-1 rounded bg-amber-300 text-black text-[10px]">Pro</span>)}</button>
                <button onClick={addToWishlist} className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-black">Add swaps to Wishlist</button>
                <button onClick={forkDeck} className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-black">Fork deck with swaps (Pro)</button>
              </div>

              {/* Divider to separate summary from swaps */}
              <div className="my-4 border-t border-neutral-800" />

              {/* Compact swap table */}
              <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
                <table className="table-fixed w-full text-sm">
                  <colgroup>
                    <col style={{ width: '45%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '35%' }} />
                    <col style={{ width: '10%' }} />
                  </colgroup>
                  <thead className="sticky top-0 z-[1] bg-neutral-950/90 backdrop-blur">
                    <tr className="text-left text-xs">
                      <th className="px-3 py-2 whitespace-normal break-words align-middle">Original</th>
                      <th className="px-3 py-2 whitespace-normal break-words align-middle text-center">
                        <div className="flex items-center justify-center gap-1">
                          Why
                          {(() => {
                            const ContextualTip = require('@/components/ContextualTip').default;
                            return (
                              <ContextualTip
                                id="budget-swaps-why-button"
                                placement="bottom"
                                maxShowCount={2}
                                trigger={
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600/20 text-blue-400 text-[10px] cursor-help">?</span>
                                }
                                content={
                                  <div className="space-y-2">
                                    <p className="font-semibold">AI-Powered Swap Analysis</p>
                                    <p className="text-xs opacity-90">Click "Why?" to get AI analysis explaining why each swap makes sense for your deck's strategy and power level.</p>
                                    <p className="text-xs opacity-75 italic">Pro feature - unlock detailed insights!</p>
                                  </div>
                                }
                              />
                            );
                          })()}
                        </div>
                      </th>
                      <th className="px-3 py-2 whitespace-normal break-words align-middle">Suggested swap</th>
                      <th className="px-3 py-2 whitespace-normal break-words align-middle text-right">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugs.map((s, idx) => {
                      const mFrom = meta[s.from.toLowerCase()] || {};
                      const mTo = meta[s.to.toLowerCase()] || {};
                      const diff = (s.price_to||0) - (s.price_from||0);
                      const good = diff < 0;
                      return (
                        <React.Fragment key={`s-${idx}`}>
                          <tr className="border-t border-neutral-800">
                            <td className="px-3 py-2 align-middle">
                            <div className="flex items-center gap-2 border border-red-900/40 rounded p-1">
                              <CardRowPreviewLeft name={s.from} imageSmall={mFrom.small} imageLarge={mFrom.large} setCode={mFrom.set} rarity={mFrom.rarity} />
                              <span className="ml-auto text-xs opacity-70">{fmt(s.price_from)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle text-center">
                            <button className="inline-flex items-center px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-black font-semibold text-[11px]" onClick={async ()=>{
                              const key = `${s.from}→${s.to}`;
                              if(!isProFinal){ (async()=>{ try{ const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('Pro feature'); } })(); return; }
                              if(whyBusy[key]) return; setWhyBusy(p=>({ ...p, [key]: true }));
                              try{
                                const r = await fetch('/api/deck/swap-why', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ from: s.from, to: s.to, deckText }) });
                                const j = await r.json().catch(()=>({}));
                                const out = (j?.text || '').toString();
                                if (out) setWhyMap(m=>({ ...m, [key]: out }));
                              } catch(e:any){ try { const { toastError } = await import('@/lib/toast-client'); toastError(e?.message||'Explain failed'); } catch { alert(e?.message||'Explain failed'); } }
                              finally { setWhyBusy(p=>({ ...p, [key]: false })); }
                            }}>{whyBusy[`${s.from}→${s.to}`] ? '…' : 'Why?'}</button>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <div className="flex items-center gap-2 border border-emerald-900/40 rounded p-1">
                              <CardRowPreviewLeft name={s.to} imageSmall={mTo.small} imageLarge={mTo.large} setCode={mTo.set} rarity={mTo.rarity} />
                              <span className="ml-auto text-xs opacity-70">{fmt(s.price_to)}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle text-right">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded ${good? 'bg-emerald-900/30 text-emerald-300':'bg-red-900/30 text-red-300'}`}>{good? '–' : '+'}{fmt(Math.abs(diff))}</span>
                          </td>
                        </tr>
                        {whyMap[`${s.from}→${s.to}`] && (
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-xs text-neutral-300 bg-neutral-900/40">{whyMap[`${s.from}→${s.to}`]}</td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Divider to separate swaps from advanced */}
              <div className="my-4 border-t border-neutral-800" />

              {/* Advanced analytics toggle */}
              <div>
                <button onClick={()=>setAdvancedOpen(v=>!v)} className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 text-xs">
                  {advancedOpen? 'Hide advanced analytics' : 'Show advanced analytics'}
                </button>
              </div>

              {advancedOpen && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-neutral-800 p-3">
                    <div className="text-sm font-semibold">Swapped subset: cost before vs after</div>
                    <PieBeforeAfter currency={currency} sugs={sugs} />
                  </div>
                  <div className="rounded-xl border border-neutral-800 p-3">
                    <div className="text-sm font-semibold">After swaps: under vs over threshold</div>
                    <HistogramUnderOver threshold={threshold} sugs={sugs} />
                  </div>
                </div>
              )}

              {error && (<div className="text-xs text-red-400">{String(error)}</div>)}
            </div>
          )}
        </section>
      </div>

    </div>
  );
}

function PieBeforeAfter({ currency, sugs }: { currency:'USD'|'EUR'|'GBP'; sugs: Array<{ price_from:number; price_to:number }> }){
  const before = sugs.reduce((a,s)=> a + (Number(s.price_from)||0), 0);
  const after = sugs.reduce((a,s)=> a + (Number(s.price_to)||0), 0);
  const total = Math.max(1, before+after);
  const pctBefore = before/total, pctAfter = after/total;
  const C = 80, R = 36, CX = C/2, CY = C/2;
  const arc = (start:number, end:number, color:string) => {
    const a0 = start * Math.PI * 2 - Math.PI/2; const a1 = end * Math.PI * 2 - Math.PI/2;
    const x0 = CX + Math.cos(a0) * R, y0 = CY + Math.sin(a0) * R;
    const x1 = CX + Math.cos(a1) * R, y1 = CY + Math.sin(a1) * R;
    const large = (end-start) > 0.5 ? 1 : 0;
    return <path d={`M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`} fill={color} />;
  };
  return (
    <div className="flex items-center gap-3">
      <svg width={C} height={C} className="shrink-0">
        {arc(0, pctBefore, '#f97316')}
        {arc(pctBefore, pctBefore + pctAfter, '#10b981')}
      </svg>
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-sm bg-[#f97316]" /> Before: {new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(before)}</div>
        <div className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-sm bg-[#10b981]" /> After: {new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(after)}</div>
        <div className="opacity-60">Subset includes only swapped cards.</div>
      </div>
    </div>
  );
}

function HistogramUnderOver({ threshold, sugs }: { threshold:number; sugs: Array<{ price_to:number }> }){
  const under = sugs.filter(s => (s.price_to||0) <= threshold).length;
  const over = sugs.length - under;
  const max = Math.max(1, Math.max(under, over));
  const H = 60;
  const bar = (v:number, color:string, label:string) => (
    <div className="flex-1 flex flex-col items-center">
      <div className="w-8 bg-neutral-800 rounded" style={{ height: `${H}px` }}>
        <div className={color} style={{ height: `${(v/max)*H}px` }} />
      </div>
      <div className="text-[10px] opacity-70 mt-1">{label}</div>
      <div className="text-xs font-mono">{v}</div>
    </div>
  );
  return (
    <div className="flex items-end gap-4">
      {bar(under, 'bg-emerald-500', 'Under')}
      {bar(over, 'bg-red-500', 'Over')}
    </div>
  );
}
