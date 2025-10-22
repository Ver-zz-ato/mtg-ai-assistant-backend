"use client";
import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceDot, CartesianGrid } from "recharts";
import { usePro } from "@/components/ProContext";
import ProBadge from "@/components/ProBadge";
import { showProToast } from "@/lib/pro-ux";
import CardAutocomplete from "@/components/CardAutocomplete";
import { AUTH_MESSAGES, showAuthToast } from "@/lib/auth-messages";

function norm(s:string){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }
const COLORS = ["#60a5fa","#f87171","#34d399","#fbbf24","#a78bfa","#f472b6","#22d3ee","#f59e0b","#93c5fd","#ef4444"]; 
const Y_AXIS_WIDTH = 48;

export default function PriceTrackerPage(){
  const [names, setNames] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<"USD"|"EUR"|"GBP">("USD");
  const [range, setRange] = React.useState<"30"|"90"|"365"|"all">("90");
  const [loading, setLoading] = React.useState(false);
  const [series, setSeries] = React.useState<Array<{ name:string; points: { date:string; unit:number }[] }>>([]);
  const [ma7, setMa7] = React.useState(false);
  const [ma30, setMa30] = React.useState(false);
  const [watchlist, setWatchlist] = React.useState<string[]>([]);
  const [deckId, setDeckId] = React.useState<string>("");
  const [deckSeries, setDeckSeries] = React.useState<Array<{ date:string; total:number }>>([]);

  const from = React.useMemo(() => {
    if (range === "all") return "";
    const days = parseInt(range,10);
    const d = new Date(Date.now() - days*24*60*60*1000);
    return d.toISOString().slice(0,10);
  }, [range]);

  // Build chart data once for render and for last point label
  const chartData = React.useMemo(() => {
    const map = new Map<string, any>();
    const withMA = (arr: { date:string; unit:number }[], window: number) => {
      if (!arr.length) return [] as { date:string; unit:number }[];
      const out: { date:string; unit:number }[] = [];
      let sum = 0; const q: number[] = [];
      for (let i=0;i<arr.length;i++){ sum += Number(arr[i].unit); q.push(Number(arr[i].unit)); if (q.length>window) sum -= q.shift()!; const avg = sum / Math.min(window, q.length); out.push({ date: arr[i].date, unit: avg }); }
      return out;
    };
    for (let i=0;i<series.length;i++){
      const s = series[i];
      for (const p of s.points) {
        if (!map.has(p.date)) map.set(p.date, { date: p.date });
        map.get(p.date)[`s${i}`] = Number(p.unit);
      }
      if (ma7) {
        const arr = withMA(s.points, 7);
        for (const p of arr) { if (!map.has(p.date)) map.set(p.date, { date: p.date }); map.get(p.date)[`s${i}:ma7`] = Number(p.unit); }
      }
      if (ma30) {
        const arr = withMA(s.points, 30);
        for (const p of arr) { if (!map.has(p.date)) map.set(p.date, { date: p.date }); map.get(p.date)[`s${i}:ma30`] = Number(p.unit); }
      }
    }
    return Array.from(map.values()).sort((a,b)=> String(a.date).localeCompare(String(b.date)));
  }, [series, ma7, ma30, from, currency]);

  async function load(){
    const picks = names.split(/[\n,]/).map(s=>s.trim()).filter(Boolean);
    if (picks.length === 0) { setSeries([]); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      picks.slice(0,10).forEach(n => qs.append("names[]", n));
      qs.set("currency", currency);
      if (from) qs.set("from", from);
      const r = await fetch(`/api/price/series?${qs.toString()}`, { cache: 'no-store' });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j?.ok) setSeries(j.series||[]); else setSeries([]);
    } finally { setLoading(false); }
  }

  React.useEffect(() => { const id = setTimeout(load, 300); return () => clearTimeout(id); /* debounce */ }, [names, currency, from]);

  function exportCsv(){
    const rows: string[][] = [["date", ...series.map(s=>s.name)]];
    // Build a map of date -> values
    const byDate = new Map<string, any>();
    for (const s of series) {
      for (const p of s.points) {
        if (!byDate.has(p.date)) byDate.set(p.date, {});
        byDate.get(p.date)[s.name] = p.unit;
      }
    }
    const dates = Array.from(byDate.keys()).sort();
    for (const d of dates) {
      const row = [d, ...series.map(s => String(byDate.get(d)?.[s.name] ?? ""))];
      rows.push(row);
    }
    const esc = (v:string) => '"'+String(v).replace(/"/g,'""')+'"';
    const csv = rows.map(r=>r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'price_series.csv'; a.click();
  }

  const chartRef = React.useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = React.useState<{ w: number; h: number }>({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = chartRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => { const cr = entries[0].contentRect; setChartSize({ w: cr.width, h: cr.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <header className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-emerald-900/20 via-blue-900/10 to-purple-900/20 p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">💹</span>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">
              Price Tracker
            </h1>
          </div>
          <p className="text-base text-neutral-300 max-w-3xl leading-relaxed">
            Track real-time card prices with historical charts. Watch your favorite cards, compare trends across formats, and export data for analysis. Updated daily with Scryfall pricing.
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              <span>Historical Data</span>
            </div>
            <div className="flex items-center gap-1.5 text-blue-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <span>Multi-Currency</span>
            </div>
            <div className="flex items-center gap-1.5 text-purple-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span>Export CSV</span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* LEFT: Watchlist (Pro) */}
        <aside className="md:col-span-3 space-y-3">
          <WatchlistPanel names={names} setNames={setNames} />
        </aside>

        {/* CENTER: Controls + Chart + Summary + Movers */}
        <section className="md:col-span-6 space-y-3">
          <section className="rounded border border-neutral-800 p-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
          <label className="md:col-span-3 text-sm">
            <div className="opacity-70 mb-1">Card</div>
            <CardSearch value={names} onPick={(n)=>setNames(n)} onChange={setNames} />
          </label>
          <label className="text-sm">
            <div className="opacity-70 mb-1">Currency</div>
            <select value={currency} onChange={e=>setCurrency(e.target.value as any)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </label>
          <label className="text-sm">
            <div className="opacity-70 mb-1">Range</div>
            <select value={range} onChange={e=>setRange(e.target.value as any)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="all">All</option>
            </select>
          </label>
          <DeckSelect deckId={deckId} setDeckId={setDeckId} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <button onClick={load} disabled={loading} className="text-xs border rounded px-2 py-1">{loading? 'Loading…' : 'Refresh'}</button>
          <button onClick={exportCsv} disabled={series.length===0} className="text-xs border rounded px-2 py-1">Export CSV</button>
          <button onClick={async()=>{ try{ const { createBrowserSupabaseClient } = await import("@/lib/supabase/client"); const sb = createBrowserSupabaseClient(); const { data: u } = await sb.auth.getUser(); const user = u?.user; if (!user) { showAuthToast(AUTH_MESSAGES.SIGN_IN_REQUIRED); return; } const arr = names ? [names] : []; await sb.auth.updateUser({ data: { watchlist_cards: arr } }); alert('Saved to watchlist'); } catch(e:any){ alert(e?.message||'save failed'); } }} className="text-xs border rounded px-2 py-1">Save to my watchlist</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 items-center text-xs">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ma7} onChange={e=>setMa7(e.target.checked)} /> Moving Average 7D</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ma30} onChange={e=>setMa30(e.target.checked)} /> Moving Average 30D</label>
        </div>
          </section>

          <section className="rounded border border-neutral-800 p-3">
            <div ref={chartRef} className="h-[320px] w-full">
              {chartSize.w > 0 && chartSize.h > 0 ? (
                <LineChart key={`lc-${series.map(s=>s.name).join('|')}-${from}-${currency}`} width={Math.floor(chartSize.w)} height={Math.floor(chartSize.h)} data={chartData} margin={{ top: 8, right: 12 + Y_AXIS_WIDTH, bottom: 8, left: 12 }}>
                  <XAxis dataKey="date" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 11 }} angle={0} minTickGap={28}/>
                  <YAxis tick={{ fontSize: 11 }} width={Y_AXIS_WIDTH} domain={[0, 'auto']} allowDecimals={false}/>
                  <Tooltip formatter={(v:any)=>[`$${Number(v).toFixed(2)}`, 'Price']} labelFormatter={(l:any)=>String(l)} />
                  <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                  {series.map((s, i) => (
                    <Line key={s.name} type="monotone" dataKey={`s${i}`} name={s.name} stroke={COLORS[i % COLORS.length]} dot={{ r: 2 }} activeDot={{ r: 3 }} strokeWidth={2} isAnimationActive={false} connectNulls />
                  ))}
                  {/* Moving averages */}
                  {ma7 && series.map((s, i) => (
                    <Line key={s.name+':ma7'} type="monotone" dataKey={`s${i}:ma7`} name={`${s.name} (MA7)`} stroke={COLORS[i % COLORS.length]} dot={false} strokeDasharray="4 3" strokeWidth={1.5} isAnimationActive={false} connectNulls />
                  ))}
                  {ma30 && series.map((s, i) => (
                    <Line key={s.name+':ma30'} type="monotone" dataKey={`s${i}:ma30`} name={`${s.name} (MA30)`} stroke={COLORS[i % COLORS.length]} dot={false} strokeDasharray="2 2" strokeWidth={1.25} isAnimationActive={false} connectNulls />
                  ))}
                  {/* Last value label on the first series */}
                  {chartData && chartData.length>0 && typeof chartData[chartData.length-1]?.s0 === 'number' && (
                    <ReferenceDot x={chartData[chartData.length-1].date} y={chartData[chartData.length-1].s0} r={3} fill="#60a5fa" label={{ value: `$${Number(chartData[chartData.length-1].s0).toFixed(2)}`, position: 'top', fill: '#9ca3af', fontSize: 10 }} />
                  )}
                </LineChart>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs opacity-70">Measuring…</div>
              )}
            </div>
            {series.length===0 && (
              <div className="text-xs opacity-70">Enter one or more card names to see price history.</div>
            )}
            <div className="mt-3 text-[10px] opacity-60">Disclaimer: Prices are sourced from daily snapshots and provided for informational purposes only. We cannot be held responsible for price fluctuations or market availability.</div>
          </section>

          <section className="rounded border border-neutral-800 p-3">
            <div className="font-medium mb-2">Summary</div>
        {series.length===0 ? (
          <div className="text-xs opacity-70">No data to summarize.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 px-2">Card</th><th className="text-right py-1 px-2">Latest</th><th className="text-right py-1 px-2">Min</th><th className="text-right py-1 px-2">Max</th><th className="text-right py-1 px-2">Avg</th></tr></thead>
              <tbody>
                {series.map(s => {
                  const vals = s.points.map(p=>Number(p.unit)).filter(n=>isFinite(n));
                  const latest = vals.length ? vals[vals.length-1] : 0;
                  const min = vals.length ? Math.min(...vals) : 0;
                  const max = vals.length ? Math.max(...vals) : 0;
                  const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
                  return (
                    <tr key={s.name} className="border-b border-neutral-900">
                      <td className="py-1 px-2 font-mono">{s.name}</td>
                      <td className="py-1 px-2 text-right">${latest.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right">${min.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right">${max.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right">${avg.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

          <section className="rounded border border-neutral-800 p-3">
            <div className="font-medium mb-2 flex items-center gap-2">Top movers (7 days)
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 cursor-default" title="Cards with the biggest changes over the chosen window. Δ is absolute price change; Δ% is percentage change. Use filters to require a minimum price or limit to your watchlist.">?
              </span>
            </div>
            <TopMovers currency={currency} />
          </section>
        </section>

        {/* RIGHT: Deck value (Pro) */}
        <aside className="md:col-span-3 space-y-3">
          <DeckValuePanel deckId={deckId} currency={currency} setDeckId={setDeckId} />
        </aside>
      </div>
    </main>
  );
}

function DeckValue({ deckId, currency }: { deckId: string; currency: 'USD'|'EUR'|'GBP' }){
  const [hoverIdx, setHoverIdx] = React.useState<number|null>(null);
  const [points, setPoints] = React.useState<Array<{date:string; total:number}>>([]);
  const [loading, setLoading] = React.useState(false);
  React.useEffect(()=>{ (async()=>{ if (!deckId) { setPoints([]); return; } try{ setLoading(true); const qs = new URLSearchParams({ deck_id: deckId, currency }); const r = await fetch(`/api/price/deck-series?${qs.toString()}`, { cache:'no-store' }); const j = await r.json().catch(()=>({})); if (r.ok && j?.ok) setPoints(j.points||[]); else setPoints([]); } finally { setLoading(false);} })(); }, [deckId, currency]);
  if (!deckId) return <div className="text-xs opacity-70">Select a deck to see its total value over time.</div>;
  if (loading) return <div className="text-xs opacity-70">Loading…</div>;
  if (!points.length) return <div className="text-xs opacity-70">No data yet for this deck.</div>;
  // Render a tiny inline svg
  const dates = points.map(p=>p.date);
  const max = Math.max(...points.map(p=>p.total));
  const min = Math.min(0, Math.min(...points.map(p=>p.total))); // always include 0 baseline
  const w=320, h=180, pad={l:36,r:8,t:12,b:18}; const ww=w-pad.l-pad.r, hh=h-pad.t-pad.b;
  const xFor=(i:number)=> pad.l + (dates.length<=1?0:(i*(ww/(dates.length-1))));
  const yFor=(v:number)=> pad.t + (hh - (hh*(v-min)/Math.max(1e-9, (max-min))));
  const d = points.map((p,i)=>`${i===0?'M':'L'} ${xFor(i)} ${yFor(p.total)}`).join(' ');
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[180px]" onMouseMove={(e)=>{ const rect=(e.currentTarget as SVGSVGElement).getBoundingClientRect(); const x=e.clientX-rect.left; const idx=Math.round(((x-pad.l)/Math.max(1,ww))*(dates.length-1)); setHoverIdx(Math.max(0, Math.min(dates.length-1, idx))); }} onMouseLeave={()=>setHoverIdx(null)}>
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t+hh} stroke="#444"/>
        <line x1={pad.l} y1={pad.t+hh} x2={pad.l+ww} y2={pad.t+hh} stroke="#444"/>
        <path d={d} fill="none" stroke="#22d3ee" strokeWidth={2}/>
        {points.map((p,i)=> (<circle key={i} cx={xFor(i)} cy={yFor(p.total)} r={i===hoverIdx?3:2} fill="#22d3ee"/>))}
        {dates.map((dt,i)=>(i%Math.ceil(dates.length/4)===0)?<text key={dt} x={xFor(i)} y={pad.t+hh+12} fontSize={9} textAnchor="middle" fill="#9ca3af">{dt}</text>:null)}
        {[0,1,2,3,4].map((i)=>{ const y=pad.t+(i*(hh/4)); const val=max - i*((max-min)/4); return (<g key={i}><line x1={pad.l} y1={y} x2={pad.l+ww} y2={y} stroke="#222"/><text x={pad.l-4} y={y+3} fontSize={9} textAnchor="end" fill="#9ca3af">${val.toFixed(0)}</text></g>);})}
        {hoverIdx!=null && (
          <g>
            <line x1={xFor(hoverIdx)} y1={pad.t} x2={xFor(hoverIdx)} y2={pad.t+hh} stroke="#666" strokeDasharray="4 3" />
          </g>
        )}
      </svg>
      {hoverIdx!=null && (
        <div className="absolute top-2 right-2 text-xs rounded border border-neutral-700 bg-black/70 px-2 py-1">
          <div className="font-mono">{dates[hoverIdx]}</div>
          <div className="font-mono text-emerald-300">${points[hoverIdx].total.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}

function DeckValuePanel({ deckId, currency, setDeckId }: { deckId: string; currency: 'USD'|'EUR'|'GBP'; setDeckId: (id: string)=>void }){
  const { isPro } = usePro();
  const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
  const [decks, setDecks] = React.useState<Array<{ id:string; title:string }>>([]);
  const pro = !!isPro;
  React.useEffect(()=>{ (async()=>{ try{ const sb = createBrowserSupabaseClient(); const { data: u } = await sb.auth.getUser(); const uid = u?.user?.id; if (!uid) return; const { data } = await sb.from('decks').select('id,title').eq('user_id', uid).order('updated_at', { ascending:false }).limit(50); setDecks((data as any[]||[]).map(d=>({ id:d.id, title:d.title||'Untitled' }))); } catch{} })(); },[]);
  return (
    <section className="rounded border border-neutral-800 p-3 space-y-2">
      <div className="font-medium flex items-center gap-2">Deck value <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span></div>
      <label className="text-sm block">
        <div className="opacity-70 mb-1">Deck</div>
        <select value={deckId} onChange={e=>{ if (!pro) { try{ showProToast(); } catch{} return; } setDeckId(e.target.value); }} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
          <option value="">— Select —</option>
          {decks.map(d=> (<option key={d.id} value={d.id}>{d.title}</option>))}
        </select>
      </label>
      {(!pro) ? (
        <div className="text-xs opacity-70">Upgrade to Pro to view and track deck value over time.</div>
      ) : (
        <DeckValue deckId={deckId} currency={currency} />
      )}
    </section>
  );
}

function WatchlistPanel({ names, setNames }: { names: string; setNames: (s:string)=>void }){
  const { isPro } = usePro();
  const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
  const [items, setItems] = React.useState<string[]>([]);
  React.useEffect(()=>{ (async()=>{ try{ const sb = createBrowserSupabaseClient(); const { data: u } = await sb.auth.getUser(); const arr = (u?.user?.user_metadata?.watchlist_cards || []) as any[]; if (Array.isArray(arr)) setItems(arr.map(s=>String(s))); } catch{} })(); },[]);
  const save = async()=>{ if (!isPro) { try{ showProToast(); } catch{} return; } try{ const sb = createBrowserSupabaseClient(); const list = names.split(/[\n,]/).map(s=>s.trim()).filter(Boolean); await sb.auth.updateUser({ data: { watchlist_cards: list } }); setItems(list); } catch(e:any){ alert(e?.message||'save failed'); } };
  const [q, setQ] = React.useState('');
  const quickAdd = async()=>{
    if (!isPro) { try{ showProToast(); } catch{} return; }
    const sb = createBrowserSupabaseClient();
    const norm = (s:string)=> s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    let name = q.trim(); if (!name) return;
    try {
      // try exact match via latest snapshot
      const { data: d0 } = await sb.from('price_snapshots').select('name_norm').eq('name_norm', norm(name)).limit(1);
      let final = d0?.[0]?.name_norm ? d0[0].name_norm : '';
      if (!final) {
        // try ilike
        const { data: d1 } = await sb.from('price_snapshots').select('name_norm').ilike('name_norm', `%${norm(name)}%`).limit(1);
        final = d1?.[0]?.name_norm || '';
      }
      if (!final) {
        // fallback to Scryfall fuzzy for canonical
        const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
        if (r.ok) { const j:any = await r.json().catch(()=>({})); final = norm(j?.name||name); }
      }
      const next = Array.from(new Set([...(items||[]), final]));
      await sb.auth.updateUser({ data: { watchlist_cards: next } });
      setItems(next); setQ('');
    } catch(e:any){ alert(e?.message||'add failed'); }
  };
  const remove = async(idx:number)=>{ if (!isPro) { try{ showProToast(); } catch{} return; } try{ const next = items.slice(); next.splice(idx,1); const sb = createBrowserSupabaseClient(); await sb.auth.updateUser({ data: { watchlist_cards: next } }); setItems(next); } catch(e:any){ alert(e?.message||'remove failed'); } };
  return (
    <section className="rounded border border-neutral-800 p-3 space-y-2">
      <div className="font-medium flex items-center gap-2">Watchlist <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span></div>
      <div className="flex gap-2 items-end">
        <label className="text-sm flex-1">
          <div className="opacity-70 mb-1">Quick add</div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search card…" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
        </label>
        <button onClick={quickAdd} className="text-xs border rounded px-2 py-1">Add</button>
      </div>
      <div className="flex gap-2">
        <button onClick={save} className="text-xs border rounded px-2 py-1">Save to my watchlist</button>
      </div>
      {items.length===0 ? (
        <div className="text-xs opacity-70">No watchlist saved.</div>
      ) : (
        <ul className="text-sm space-y-1">
          {items.map((n,i)=> (
            <li key={n+i} className="flex items-center justify-between gap-2">
              <button onClick={()=> setNames(names ? `${names.replace(/\s+$/,'')}, ${n}` : n)} className="underline text-left truncate flex-1">{n}</button>
              <button onClick={()=>remove(i)} className="text-xs border rounded px-1">×</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CardSearch({ value, onChange, onPick }: { value: string; onChange: (v:string)=>void; onPick: (n:string)=>void }){
  const [img, setImg] = React.useState<string>('');
  React.useEffect(()=>{ (async()=>{ const n=value.trim(); if(!n) { setImg(''); return; } try{ const r=await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(n)}`); if(!r.ok){ setImg(''); return;} const j:any=await r.json().catch(()=>({})); const im=j?.image_uris||j?.card_faces?.[0]?.image_uris||{}; setImg(im.small||im.normal||''); } catch{ setImg(''); } })(); }, [value]);
  const [pv,setPv]=React.useState<{shown:boolean;src:string;x:number;y:number}>({shown:false,src:'',x:0,y:0});
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <CardAutocomplete value={value} onChange={onChange} onPick={onPick} />
      </div>
      {img && (
        <img src={img} alt="thumb" className="w-10 h-14 rounded object-cover" onMouseEnter={(e)=>setPv({shown:true,src:img.replace('/small','/normal'),x:e.clientX,y:e.clientY})} onMouseMove={(e)=>setPv(p=>({...p,x:e.clientX,y:e.clientY}))} onMouseLeave={()=>setPv({shown:false,src:'',x:0,y:0})} />
      )}
      {pv.shown && (
        <div className="fixed z-[60] pointer-events-none" style={{ left: pv.x+10, top: pv.y-10 }}>
          <img src={pv.src} alt="preview" className="w-64 h-auto rounded shadow-xl" />
        </div>
      )}
    </div>
  );
}

function DeckSelect({ deckId, setDeckId }: { deckId: string; setDeckId: (id:string)=>void }){
  const [decks, setDecks] = React.useState<Array<{ id:string; title:string }>>([]);
  React.useEffect(()=>{ (async()=>{ try{ const { createBrowserSupabaseClient } = await import('@/lib/supabase/client'); const sb = createBrowserSupabaseClient(); const { data: u } = await sb.auth.getUser(); const uid = u?.user?.id; if (!uid) return; const { data } = await sb.from('decks').select('id,title').eq('user_id', uid).order('updated_at', { ascending:false }).limit(50); setDecks((data as any[]||[]).map(d=>({ id:d.id, title:d.title||'Untitled' }))); } catch{} })(); },[]);
  return (
    <label className="text-sm">
      <div className="opacity-70 mb-1">Deck</div>
      <select value={deckId} onChange={e=>setDeckId(e.target.value)} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
        <option value="">— Select —</option>
        {decks.map(d => (<option key={d.id} value={d.id}>{d.title}</option>))}
      </select>
    </label>
  );
}

function TopMovers({ currency }: { currency: 'USD'|'EUR'|'GBP' }){
  const [rows, setRows] = React.useState<Array<{ name:string; prior:number; latest:number; delta:number; pct:number }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [windowDays, setWindowDays] = React.useState(7);
  const [minPrice, setMinPrice] = React.useState(0);
  const [watchOnly, setWatchOnly] = React.useState(false);
  const [watch, setWatch] = React.useState<string[]>([]);
  React.useEffect(()=>{ (async()=>{ try{ const { createBrowserSupabaseClient } = await import('@/lib/supabase/client'); const sb = createBrowserSupabaseClient(); const { data: u } = await sb.auth.getUser(); const arr = (u?.user?.user_metadata?.watchlist_cards || []) as any[]; setWatch(Array.isArray(arr)?arr.map(String):[]); } catch{} })(); }, []);
  React.useEffect(()=>{ (async()=>{ try{ setLoading(true); const r=await fetch(`/api/price/movers?currency=${encodeURIComponent(currency)}&window_days=${windowDays}&limit=100`, { cache:'no-store' }); const j=await r.json().catch(()=>({})); if (r.ok && j?.ok) setRows(j.rows||[]); else setRows([]); } finally { setLoading(false); } })(); }, [currency, windowDays]);
  const filtered = rows.filter(r => r.latest >= (minPrice||0)).filter(r => !watchOnly || watch.includes(r.name));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-1">Window
          <select value={windowDays} onChange={e=>setWindowDays(parseInt(e.target.value,10))} className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5">
            <option value={1}>1d</option>
            <option value={7}>7d</option>
            <option value={30}>30d</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1">Min price
          <input type="number" min={0} step="0.5" value={minPrice} onChange={e=>setMinPrice(Math.max(0, Number(e.target.value)||0))} className="w-20 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-right" />
        </label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={watchOnly} onChange={e=>setWatchOnly(e.target.checked)} /> Watchlist only</label>
      </div>
      {loading && <div className="text-xs opacity-70">Loading…</div>}
      {!loading && filtered.length===0 && <div className="text-xs opacity-70">No movers for the selected filters.</div>}
      <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="border-b border-neutral-800"><th className="text-left py-1 px-2">Card</th><th className="text-right py-1 px-2">Prior</th><th className="text-right py-1 px-2">Latest</th><th className="text-right py-1 px-2">Δ</th><th className="text-right py-1 px-2">Δ%</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name} className="border-b border-neutral-900">
              <td className="py-1 px-2 font-mono">{r.name}</td>
              <td className="py-1 px-2 text-right">${r.prior.toFixed(2)}</td>
              <td className="py-1 px-2 text-right">${r.latest.toFixed(2)}</td>
              <td className={`py-1 px-2 text-right ${r.delta>=0?'text-emerald-400':'text-red-400'}`}>{r.delta>=0?'+':''}{r.delta.toFixed(2)}</td>
              <td className={`py-1 px-2 text-right ${r.pct>=0?'text-emerald-400':'text-red-400'}`}>{(r.pct*100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
