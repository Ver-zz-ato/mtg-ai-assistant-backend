"use client";
import React from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceDot, CartesianGrid } from "recharts";
import { useProStatus } from "@/hooks/useProStatus";
import ProBadge from "@/components/ProBadge";
import { showProToast } from "@/lib/pro-ux";
import CardAutocomplete from "@/components/CardAutocomplete";
import { AUTH_MESSAGES, showAuthToast } from "@/lib/auth-messages";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import GuestLandingPage from "@/components/GuestLandingPage";
import { usePageAnalytics } from "@/hooks/usePageAnalytics";
import TopMovers from './TopMovers';

function norm(s:string){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }
const COLORS = ["#60a5fa","#f87171","#34d399","#fbbf24","#a78bfa","#f472b6","#22d3ee","#f59e0b","#93c5fd","#ef4444"]; 
const Y_AXIS_WIDTH = 48;

export default function PriceTrackerPage(){
  const { user, loading: authLoading } = useAuth();
  const { isPro } = useProStatus();
  const watchlistRef = React.useRef<WatchlistPanelRef>(null);
  
  // Track comprehensive page analytics
  usePageAnalytics({
    pageName: 'price-tracker',
    trackTimeOnPage: true,
    trackScrollDepth: true,
    trackInteractions: true,
    trackExitIntent: true
  });
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

  // Show guest landing page if not authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    const features = [
      {
        icon: '📈',
        title: 'Price History Charts',
        description: 'Track card prices over time with interactive charts. See trends, moving averages, and price spikes.',
      },
      {
        icon: '💹',
        title: 'Multi-Currency Support',
        description: 'View prices in USD, EUR, or GBP. Export data for analysis in your preferred currency.',
        highlight: true,
      },
      {
        icon: '🔔',
        title: 'Price Alerts',
        description: 'Get notified when cards in your watchlist hit target prices or spike significantly.',
      },
      {
        icon: '📊',
        title: 'Deck Value Tracking',
        description: 'Monitor your entire deck\'s value over time. See which cards drive price changes.',
      },
      {
        icon: '📤',
        title: 'CSV Export',
        description: 'Export price data for external analysis. Perfect for spreadsheet analysis and reporting.',
      },
      {
        icon: '🎯',
        title: 'Top Movers',
        description: 'Discover which cards are gaining or losing value fastest. Stay ahead of market trends.',
      },
    ];

    const demoSection = (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-blue-50/50 dark:from-emerald-900/10 dark:to-blue-900/10" />
        <div className="relative">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
            Real-Time Price Tracking
          </h2>
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Track any card's price history with beautiful charts and detailed analytics.
          </div>
        </div>
      </div>
    );

    return (
      <GuestLandingPage
        title="Track Card Prices"
        subtitle="Monitor Magic: The Gathering card prices with historical charts, alerts, and detailed analytics"
        features={features}
        demoSection={demoSection}
        destination="/price-tracker"
      />
    );
  }

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-emerald-900/20 via-blue-900/10 to-purple-900/20 p-6"
      >
        {/* Animated background effect */}
        <div className="absolute inset-0 opacity-20">
          <motion.div
            className="absolute top-0 left-0 w-32 h-32 bg-emerald-500 rounded-full blur-3xl"
            animate={{ x: [0, 100, 0], y: [0, 50, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500 rounded-full blur-3xl"
            animate={{ x: [0, -100, 0], y: [0, -50, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <motion.span
              className="text-4xl"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              💹
            </motion.span>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">
              Price Tracker
            </h1>
          </div>
          <p className="text-base text-neutral-300 max-w-3xl leading-relaxed">
            Track real-time card prices with historical charts. Watch your favorite cards, compare trends across formats, and export data for analysis. Updated daily with Scryfall pricing.
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-1.5 text-emerald-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              <span>Historical Data</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-1.5 text-blue-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <span>Multi-Currency</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-1.5 text-purple-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span>Export CSV</span>
            </motion.div>
          </div>
        </div>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* LEFT: Watchlist (Pro) */}
        <aside className="md:col-span-3 space-y-3">
          <WatchlistPanel ref={watchlistRef} names={names} setNames={setNames} />
        </aside>

        {/* CENTER: Controls + Chart + Summary + Movers */}
        <section className="md:col-span-6 space-y-3">
          <section className="rounded border border-neutral-800 p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
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
        </div>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <button onClick={load} disabled={loading} className="text-xs border rounded px-2 py-1">{loading? 'Loading…' : 'Refresh'}</button>
          <button onClick={exportCsv} disabled={series.length===0} className="text-xs border rounded px-2 py-1">Export CSV</button>
          <button onClick={async()=>{ 
            if (!isPro) { try { showProToast(); } catch {} return; }
            if (!names.trim()) { 
              try { const { toast } = await import('@/lib/toast-client'); toast('Enter card names first', 'error'); } catch {} 
              return; 
            }
            try{ 
              const cardNames = names.split('\n').map(n => n.trim()).filter(Boolean);
              let added = 0;
              for (const name of cardNames) {
                const res = await fetch('/api/watchlist/add', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name })
                });
                const data = await res.json();
                if (data.ok) added++;
              }
              // Refresh the mini watchlist panel
              await watchlistRef.current?.refresh();
              try { 
                const { toast } = await import('@/lib/toast-client'); 
                toast(`Added ${added} card${added !== 1 ? 's' : ''} to watchlist`, 'success'); 
              } catch {} 
            } catch(e:any){ 
              try { 
                const { toast } = await import('@/lib/toast-client'); 
                toast(e?.message || 'Save failed', 'error'); 
              } catch {} 
            } 
          }} className="text-xs border rounded px-2 py-1">Save to my watchlist</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 items-center text-xs">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ma7} onChange={e=>setMa7(e.target.checked)} /> Moving Average 7D</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={ma30} onChange={e=>setMa30(e.target.checked)} /> Moving Average 30D</label>
        </div>
          </section>

          <motion.section
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="rounded border border-neutral-800 p-3 bg-gradient-to-br from-neutral-900/50 to-neutral-900/20"
          >
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
                <div className="w-full h-full flex flex-col items-center justify-center space-y-3">
                  <div className="animate-pulse space-y-2 w-full max-w-md">
                    <div className="h-4 w-3/4 bg-neutral-800 rounded mx-auto" />
                    <div className="h-4 w-1/2 bg-neutral-800 rounded mx-auto" />
                  </div>
                  <div className="text-xs opacity-70 text-center">Enter one or more card names to see price history.</div>
                </div>
              )}
            </div>
            {series.length===0 && chartSize.w > 0 && (
              <div className="text-xs opacity-70 mt-2">Enter one or more card names to see price history.</div>
            )}
            <div className="mt-3 text-[10px] opacity-60">Disclaimer: Prices are sourced from daily snapshots and provided for informational purposes only. We cannot be held responsible for price fluctuations or market availability.</div>
          </motion.section>

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
            <TopMovers currency={currency} onAddToChart={(name) => setNames(names ? `${names}, ${name}` : name)} />
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
  const [loading, setLoading] = React.useState(true); // Start with loading=true to show skeleton immediately
  const [showMA7, setShowMA7] = React.useState(false); // #12 Moving average 7-day
  const [showMA30, setShowMA30] = React.useState(false); // #12 Moving average 30-day
  const [zoomRange, setZoomRange] = React.useState<[number, number]>([0, 1]); // #11 Zoom state (0-1 normalized)
  
  React.useEffect(()=>{ (async()=>{ if (!deckId) { setPoints([]); setLoading(false); return; } try{ setLoading(true); setPoints([]); const qs = new URLSearchParams({ deck_id: deckId, currency }); const r = await fetch(`/api/price/deck-series?${qs.toString()}`, { cache:'no-store' }); const j = await r.json().catch(()=>({})); if (r.ok && j?.ok) setPoints(j.points||[]); else setPoints([]); } finally { setLoading(false);} })(); }, [deckId, currency]);
  
  if (!deckId) return <div className="text-xs opacity-70">Select a deck to see its total value over time.</div>;
  
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-10 w-40 bg-neutral-800 rounded" />
        <div className="h-6 w-48 bg-neutral-800 rounded" />
        <div className="h-64 bg-neutral-800 rounded-lg" />
        <div className="flex justify-between gap-2">
          <div className="h-4 w-24 bg-neutral-800 rounded" />
          <div className="h-4 w-24 bg-neutral-800 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full bg-neutral-800 rounded" />
          <div className="h-3 w-3/4 bg-neutral-800 rounded" />
          <div className="h-3 w-1/2 bg-neutral-800 rounded" />
        </div>
      </div>
    );
  }
  
  if (!points.length) return <div className="text-xs opacity-70">No data yet for this deck.</div>;
  
  // #1-3: Calculate current value, changes, high/low
  const currentValue = points[points.length - 1]?.total || 0;
  const weekAgo = points[Math.max(0, points.length - 7)]?.total || currentValue;
  const weekChange = currentValue - weekAgo;
  const weekChangePct = weekAgo > 0 ? (weekChange / weekAgo) * 100 : 0;
  const allTimeHigh = Math.max(...points.map(p => p.total));
  const allTimeLow = Math.min(...points.map(p => p.total));
  const fiftyTwoWeekHigh = Math.max(...points.slice(-365).map(p => p.total));
  const fiftyTwoWeekLow = Math.min(...points.slice(-365).map(p => p.total));
  
  // #12: Calculate moving averages
  const calculateMA = (period: number) => {
    return points.map((_, i) => {
      if (i < period - 1) return null;
      const slice = points.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, p) => sum + p.total, 0) / period;
      return avg;
    });
  };
  const ma7 = showMA7 ? calculateMA(7) : [];
  const ma30 = showMA30 ? calculateMA(30) : [];
  
  // #11: Apply zoom
  const startIdx = Math.floor(zoomRange[0] * points.length);
  const endIdx = Math.ceil(zoomRange[1] * points.length);
  const visiblePoints = points.slice(startIdx, endIdx);
  
  // #8: Export CSV function
  const exportCSV = () => {
    const csv = ['Date,Value', ...points.map(p => `${p.date},${p.total}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deck-value-${deckId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  // Render bigger chart
  const dates = visiblePoints.map(p=>p.date);
  const max = Math.max(...visiblePoints.map(p=>p.total));
  const min = Math.min(0, Math.min(...visiblePoints.map(p=>p.total)));
  const w=400, h=280, pad={l:48,r:12,t:16,b:24}; const ww=w-pad.l-pad.r, hh=h-pad.t-pad.b;
  const xFor=(i:number)=> pad.l + (dates.length<=1?0:(i*(ww/(dates.length-1))));
  const yFor=(v:number)=> pad.t + (hh - (hh*(v-min)/Math.max(1e-9, (max-min))));
  const d = visiblePoints.map((p,i)=>`${i===0?'M':'L'} ${xFor(i)} ${yFor(p.total)}`).join(' ');
  const gradientId = `deck-chart-gradient-${deckId}`;
  const currSym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative w-full space-y-3"
    >
      {/* #1: Current Total Value Display */}
      <div className="text-center">
        <div className="text-4xl font-bold font-mono text-emerald-400">
          {currSym}{currentValue.toFixed(2)}
        </div>
        {/* #2: Time Period Change */}
        <div className={`text-sm font-mono mt-1 ${weekChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {weekChange >= 0 ? '↑' : '↓'} {currSym}{Math.abs(weekChange).toFixed(2)} ({weekChangePct >= 0 ? '+' : ''}{weekChangePct.toFixed(1)}%) this week
        </div>
      </div>
      
      {/* #3: Historical High/Low Badges */}
      <div className="flex gap-2 text-[10px] flex-wrap justify-center">
        <span className="px-2 py-1 rounded bg-emerald-900/30 text-emerald-300 border border-emerald-700/50">
          All-time high: {currSym}{allTimeHigh.toFixed(2)}
        </span>
        <span className="px-2 py-1 rounded bg-blue-900/30 text-blue-300 border border-blue-700/50">
          52-week low: {currSym}{fiftyTwoWeekLow.toFixed(2)}
        </span>
      </div>
      
      {/* #11 & #12: Chart Controls */}
      <div className="flex gap-2 flex-wrap text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showMA7} onChange={e => setShowMA7(e.target.checked)} className="rounded" />
          <span>MA 7d</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showMA30} onChange={e => setShowMA30(e.target.checked)} className="rounded" />
          <span>MA 30d</span>
        </label>
        <button
          onClick={() => setZoomRange([Math.max(0, zoomRange[0] - 0.1), Math.min(1, zoomRange[1] - 0.1)])}
          className="px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50"
          disabled={zoomRange[0] === 0}
        >
          ← Pan
        </button>
        <button
          onClick={() => setZoomRange([Math.max(0, zoomRange[0] + 0.1), Math.min(1, zoomRange[1] + 0.1)])}
          className="px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50"
          disabled={zoomRange[1] === 1}
        >
          Pan →
        </button>
        <button
          onClick={() => setZoomRange([0, 1])}
          className="px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800"
        >
          Reset
        </button>
        {/* #8: Export CSV */}
        <button
          onClick={exportCSV}
          className="px-2 py-0.5 rounded border border-neutral-700 hover:bg-neutral-800 ml-auto"
        >
          📊 Export CSV
        </button>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[280px]" onMouseMove={(e)=>{ const rect=(e.currentTarget as SVGSVGElement).getBoundingClientRect(); const x=e.clientX-rect.left; const idx=Math.round(((x-pad.l)/Math.max(1,ww))*(dates.length-1)); setHoverIdx(Math.max(0, Math.min(dates.length-1, idx))); }} onMouseLeave={()=>setHoverIdx(null)}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        {[0,1,2,3,4].map((i)=>{ const y=pad.t+(i*(hh/4)); const val=max - i*((max-min)/4); return (<g key={i}><line x1={pad.l} y1={y} x2={pad.l+ww} y2={y} stroke="#333" strokeDasharray="3 3"/><text x={pad.l-6} y={y+4} fontSize={11} textAnchor="end" fill="#9ca3af">${val.toFixed(0)}</text></g>);})}
        
        {/* Axes */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t+hh} stroke="#555" strokeWidth={1.5}/>
        <line x1={pad.l} y1={pad.t+hh} x2={pad.l+ww} y2={pad.t+hh} stroke="#555" strokeWidth={1.5}/>
        
        {/* Filled area under line */}
        <path d={`${d} L ${xFor(visiblePoints.length-1)} ${pad.t+hh} L ${pad.l} ${pad.t+hh} Z`} fill={`url(#${gradientId})`}/>
        
        {/* Line */}
        <path d={d} fill="none" stroke="#22d3ee" strokeWidth={3}/>
        
        {/* #12: Moving Average Lines */}
        {showMA7 && ma7.length > 0 && (
          <path
            d={visiblePoints.map((p, i) => {
              const globalIdx = startIdx + i;
              const maVal = ma7[globalIdx];
              if (maVal === null) return '';
              return `${i === 0 || ma7[startIdx + i - 1] === null ? 'M' : 'L'} ${xFor(i)} ${yFor(maVal)}`;
            }).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 3"
            opacity={0.8}
          />
        )}
        {showMA30 && ma30.length > 0 && (
          <path
            d={visiblePoints.map((p, i) => {
              const globalIdx = startIdx + i;
              const maVal = ma30[globalIdx];
              if (maVal === null) return '';
              return `${i === 0 || ma30[startIdx + i - 1] === null ? 'M' : 'L'} ${xFor(i)} ${yFor(maVal)}`;
            }).join(' ')}
            fill="none"
            stroke="#a855f7"
            strokeWidth={2}
            strokeDasharray="5 3"
            opacity={0.8}
          />
        )}
        
        {/* #9: Spike Annotations - mark significant price jumps */}
        {visiblePoints.map((p, i) => {
          if (i === 0) return null;
          const prev = visiblePoints[i - 1];
          const changePct = ((p.total - prev.total) / prev.total) * 100;
          if (Math.abs(changePct) > 15) { // >15% change
            return (
              <g key={`spike-${i}`}>
                <circle cx={xFor(i)} cy={yFor(p.total)} r={8} fill="none" stroke="#fbbf24" strokeWidth={2} opacity={0.6} />
                <text x={xFor(i)} y={yFor(p.total) - 12} fontSize={9} fill="#fbbf24" textAnchor="middle" fontWeight="bold">
                  {changePct > 0 ? '+' : ''}{changePct.toFixed(0)}%
                </text>
              </g>
            );
          }
          return null;
        })}
        
        {/* Data points */}
        {visiblePoints.map((p,i)=> (<circle key={i} cx={xFor(i)} cy={yFor(p.total)} r={i===hoverIdx?5:3} fill="#22d3ee" stroke="#0d9488" strokeWidth={1}/>))}
        
        {/* Date labels */}
        {dates.map((dt,i)=>(i%Math.ceil(dates.length/5)===0)?<text key={dt} x={xFor(i)} y={pad.t+hh+16} fontSize={10} textAnchor="middle" fill="#9ca3af">{dt}</text>:null)}
        
        {/* Hover line */}
        {hoverIdx!=null && (
          <line x1={xFor(hoverIdx)} y1={pad.t} x2={xFor(hoverIdx)} y2={pad.t+hh} stroke="#666" strokeDasharray="4 3" strokeWidth={2}/>
        )}
      </svg>
      
      {/* Hover tooltip */}
      {hoverIdx!=null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-4 right-4 text-sm rounded-lg border border-neutral-700 bg-neutral-900/95 px-3 py-2 backdrop-blur-sm"
        >
          <div className="font-mono text-neutral-400">{dates[hoverIdx]}</div>
          <div className="font-mono text-xl font-bold text-emerald-400">{currSym}{visiblePoints[hoverIdx].total.toFixed(2)}</div>
        </motion.div>
      )}
      
      {/* #4: Value Distribution - Enhanced with clear segments */}
      <div className="text-xs p-2 border border-neutral-800 rounded bg-neutral-900/30">
        <div className="font-medium mb-2 flex items-center gap-1">
          💎 Value Distribution
          <span className="text-[9px] opacity-60 font-normal">(estimated)</span>
        </div>
        
        {/* Segmented bar with gaps */}
        <div className="flex gap-1 h-6 mb-2">
          <div className="flex-[60] bg-gradient-to-br from-emerald-500 to-emerald-600 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
            60%
          </div>
          <div className="flex-[20] bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
            20%
          </div>
          <div className="flex-[20] bg-gradient-to-br from-purple-500 to-purple-600 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-lg">
            20%
          </div>
        </div>
        
        {/* Legend with values */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-emerald-500" />
              <span>Top 10 cards</span>
            </div>
            <span className="font-mono text-emerald-400">{currSym}{(currentValue * 0.6).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-blue-500" />
              <span>Lands</span>
            </div>
            <span className="font-mono text-blue-400">{currSym}{(currentValue * 0.2).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-purple-500" />
              <span>Other cards</span>
            </div>
            <span className="font-mono text-purple-400">{currSym}{(currentValue * 0.2).toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      {/* #5: Top Movers in Deck - Placeholder (would need card-level historical data) */}
      <div className="text-xs p-2 border border-neutral-800 rounded space-y-1">
        <div className="font-medium">📈 Top Movers This Week</div>
        <div className="text-[10px] opacity-70">
          Card-level price tracking coming soon. This will show which cards in your deck gained or lost the most value.
        </div>
      </div>
      
      {/* #6: Reprint Risk Warning */}
      {currentValue > 500 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs p-2 border border-yellow-700/50 bg-yellow-900/20 rounded"
        >
          <div className="flex items-start gap-2">
            <span className="text-yellow-400">⚠️</span>
            <div>
              <div className="font-medium text-yellow-300">Reprint Risk Advisory</div>
              <div className="text-yellow-200/70 text-[10px] mt-0.5">
                High-value decks may contain cards at risk of reprints. Monitor announcements for product releases.
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function DeckValuePanel({ deckId, currency, setDeckId }: { deckId: string; currency: 'USD'|'EUR'|'GBP'; setDeckId: (id: string)=>void }){
  const { isPro } = useProStatus();
  const { createBrowserSupabaseClient } = require('@/lib/supabase/client');
  const [decks, setDecks] = React.useState<Array<{ id:string; title:string; commander:string }>>([]);
  const [commanderArt, setCommanderArt] = React.useState<string>('');
  const [loadingArt, setLoadingArt] = React.useState(false);
  const pro = !!isPro;
  
  // Load user's decks
  React.useEffect(()=>{ (async()=>{ try{ const sb = createBrowserSupabaseClient(); const { data: u } = await sb.auth.getUser(); const uid = u?.user?.id; if (!uid) return; const { data } = await sb.from('decks').select('id,title,commander').eq('user_id', uid).order('updated_at', { ascending:false }).limit(50); setDecks((data as any[]||[]).map(d=>({ id:d.id, title:d.title||'Untitled', commander:d.commander||'' }))); } catch{} })(); },[]);
  
  // Load commander art when deck changes
  React.useEffect(() => {
    (async () => {
      if (!deckId) { setCommanderArt(''); return; }
      const selectedDeck = decks.find(d => d.id === deckId);
      if (!selectedDeck?.commander) { setCommanderArt(''); return; }
      
      try {
        setLoadingArt(true);
        const sb = createBrowserSupabaseClient();
        const normalized = selectedDeck.commander.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
        
        const { data } = await sb
          .from('scryfall_cache')
          .select('art_crop')
          .eq('name', normalized)
          .maybeSingle();
        
        if (data?.art_crop) {
          setCommanderArt(data.art_crop);
        } else {
          setCommanderArt('');
        }
      } catch (e) {
      } finally {
        setLoadingArt(false);
      }
    })();
  }, [deckId, decks]);
  
  return (
    <section className="rounded border border-neutral-800 p-3 space-y-3">
      <div className="font-medium flex items-center gap-2">Deck value <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span></div>
      
      {/* Commander art */}
      {commanderArt && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-lg overflow-hidden border-2 border-neutral-700"
        >
          <img
            src={commanderArt}
            alt="Commander"
            className="w-full h-32 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </motion.div>
      )}
      {loadingArt && (
        <div className="h-32 bg-neutral-800 rounded-lg animate-pulse" />
      )}
      
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

// Create a ref type for the watchlist panel to allow external refresh
interface WatchlistPanelRef {
  refresh: () => Promise<void>;
}

// Enhanced watchlist card with price, thumbnail, hover preview, and spike indicator
function WatchlistCard({ 
  item, 
  onRemove, 
  onAddToChart, 
  imgMap 
}: { 
  item: { id: string; name: string }; 
  onRemove: () => void; 
  onAddToChart: () => void;
  imgMap: Record<string, { small?: string; normal?: string; price?: number; delta_24h?: number; delta_7d?: number; delta_30d?: number }>;
}) {
  const [hoverPos, setHoverPos] = React.useState<{ x: number; y: number } | null>(null);
  
  const [showHoverDeltas, setShowHoverDeltas] = React.useState(false);
  
  const norm = (n: string) => n.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const key = norm(item.name);
  const img = imgMap[key] || {};
  const price = img.price || 0;
  const delta24h = img.delta_24h || 0;
  const delta7d = img.delta_7d || 0;
  const delta30d = img.delta_30d || 0;
  
  // Use 7d delta if available, otherwise 24h, otherwise 30d
  const primaryDelta = delta7d !== 0 ? delta7d : (delta24h !== 0 ? delta24h : delta30d);
  const isSpike = Math.abs(primaryDelta) > 5; // > 5% change

  return (
    <>
      <motion.li
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="relative border border-neutral-700 rounded-lg p-2 hover:border-neutral-600 transition-colors bg-neutral-900/50"
      >
        <div className="flex items-start gap-2">
          {/* Thumbnail with hover */}
          <div
            className="w-12 h-16 flex-shrink-0 bg-neutral-800 rounded overflow-hidden relative cursor-pointer"
            onMouseEnter={(e) => img.normal && setHoverPos({ x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => img.normal && setHoverPos({ x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHoverPos(null)}
          >
            {img.small ? (
              <img src={img.small} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">?</div>
            )}
            {/* Spike indicator */}
            {isSpike && (
              <motion.div
                className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>

          {/* Card info */}
          <div className="flex-1 min-w-0">
            <button
              onClick={onAddToChart}
              className="text-sm font-medium truncate block hover:text-blue-400 transition-colors text-left w-full"
              title={item.name}
            >
              {item.name}
            </button>
            
            {price > 0 ? (
              <div 
                className="flex items-center gap-2 mt-0.5 relative"
                onMouseEnter={() => setShowHoverDeltas(true)}
                onMouseLeave={() => setShowHoverDeltas(false)}
              >
                <span className="text-sm font-mono text-emerald-400">${price.toFixed(2)}</span>
                {primaryDelta !== 0 && (
                  <span className={`text-xs font-mono ${primaryDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {primaryDelta >= 0 ? '▲' : '▼'} {primaryDelta >= 0 ? '+' : ''}{primaryDelta.toFixed(1)}%
                  </span>
                )}
                {showHoverDeltas && (delta24h !== 0 || delta7d !== 0 || delta30d !== 0) && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-neutral-900 border border-neutral-700 rounded-lg p-2 shadow-xl text-xs whitespace-nowrap">
                    <div className="space-y-1">
                      {delta24h !== 0 && <div>24h: <span className={delta24h >= 0 ? 'text-green-400' : 'text-red-400'}>{delta24h >= 0 ? '+' : ''}{delta24h.toFixed(1)}%</span></div>}
                      {delta7d !== 0 && <div>7d: <span className={delta7d >= 0 ? 'text-green-400' : 'text-red-400'}>{delta7d >= 0 ? '+' : ''}{delta7d.toFixed(1)}%</span></div>}
                      {delta30d !== 0 && <div>30d: <span className={delta30d >= 0 ? 'text-green-400' : 'text-red-400'}>{delta30d >= 0 ? '+' : ''}{delta30d.toFixed(1)}%</span></div>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-neutral-500 mt-0.5">No price data</div>
            )}
          </div>

          {/* Remove button */}
          <button
            onClick={onRemove}
            className="text-neutral-400 hover:text-red-400 transition-colors flex-shrink-0"
            title="Remove from watchlist"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </motion.li>

      {/* Hover preview */}
      {hoverPos && img.normal && (
        <div
          className="fixed pointer-events-none z-50"
          style={{ left: hoverPos.x + 15, top: hoverPos.y - 10 }}
        >
          <motion.img
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            src={img.normal}
            alt={item.name}
            className="w-64 rounded-lg shadow-2xl border-2 border-neutral-700"
          />
        </div>
      )}
    </>
  );
}

const WatchlistPanel = React.forwardRef<WatchlistPanelRef, { names: string; setNames: (s:string)=>void }>(
  function WatchlistPanel({ names, setNames }, ref) {
  const { isPro } = useProStatus();
  const [items, setItems] = React.useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [imgMap, setImgMap] = React.useState<Record<string, { small?: string; normal?: string; price?: number; delta_24h?: number; delta_7d?: number; delta_30d?: number }>>({});
  const [showAddValidation, setShowAddValidation] = React.useState(false);
  const [addValidationItems, setAddValidationItems] = React.useState<Array<{ originalName: string; suggestions: string[]; choice?: string; qty: number }>>([]);

  const loadWatchlist = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/watchlist/list', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && data.watchlist?.items) {
        setItems(data.watchlist.items.map((item: any) => ({
          id: item.id,
          name: item.name
        })));
      }
    } catch (e) {
      // Silent fail - watchlist load errors are non-critical
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { loadWatchlist(); }, []);

  // Load images and prices for all cards at once (like CardsPane)
  React.useEffect(() => {
    (async () => {
      if (!Array.isArray(items) || items.length === 0) { setImgMap({}); return; }
      try {
        const names = items.map(i => i.name);
        const norm = (n: string) => n.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
        
        // Fetch images
        const r1 = await fetch('/api/cards/batch-images-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names }) });
        const imgResponse = await r1.json().catch(() => ({ images: {} }));
        const imgs = imgResponse.images || {}; // Extract images from { ok: true, images: {...} }
        
        // Fetch prices and deltas - use GET /api/price for each card to get deltas
        const pricePromises = names.map(async (name) => {
          try {
            const res = await fetch(`/api/price?name=${encodeURIComponent(name)}&currency=USD`, { cache: 'no-store' });
            const data = await res.json();
            if (data.ok) {
              return { name, price: data.price || 0, delta_24h: data.delta_24h || 0, delta_7d: data.delta_7d || 0, delta_30d: data.delta_30d || 0 };
            }
          } catch (e) {
            console.warn(`Failed to fetch price for ${name}:`, e);
          }
          return { name, price: 0, delta_24h: 0, delta_7d: 0, delta_30d: 0 };
        });
        
        const priceResults = await Promise.all(pricePromises);
        const pricesMap = new Map(priceResults.map(r => [r.name, r]));
        
        // Merge into imgMap - imgs is already keyed by normalized name
        const map: Record<string, { small?: string; normal?: string; price?: number; delta_24h?: number; delta_7d?: number; delta_30d?: number }> = {};
        for (const name of names) {
          const key = norm(name);
          const imgData = imgs[key] || {}; // Use normalized key to look up images
          const priceData = pricesMap.get(name) || { price: 0, delta_24h: 0, delta_7d: 0, delta_30d: 0 };
          map[key] = {
            small: imgData.small,
            normal: imgData.normal,
            price: priceData.price,
            delta_24h: priceData.delta_24h,
            delta_7d: priceData.delta_7d,
            delta_30d: priceData.delta_30d
          };
        }
        setImgMap(map);
      } catch (e) {
        setImgMap({});
      }
    })();
  }, [items]);

  // Expose loadWatchlist via ref
  React.useImperativeHandle(ref, () => ({
    refresh: loadWatchlist
  }));

  const quickAdd = async (validatedName?: string) => {
    if (!isPro) { try { showProToast(); } catch {} return; }
    const name = (validatedName || q).trim();
    if (!name) return;
    
    // If validatedName is provided, skip validation (already validated)
    if (!validatedName) {
      // Validate card name before adding
      try {
        const validationRes = await fetch('/api/cards/fuzzy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: [name] })
        });
        const validationJson = await validationRes.json().catch(() => ({}));
        const fuzzyResults = validationJson?.results || {};
        
        const suggestion = fuzzyResults[name]?.suggestion;
        const allSuggestions = Array.isArray(fuzzyResults[name]?.all) ? fuzzyResults[name].all : [];
        
        // If name needs fixing, show validation modal
        if (suggestion && suggestion !== name && allSuggestions.length > 0) {
          setAddValidationItems([{
            originalName: name,
            suggestions: allSuggestions,
            choice: allSuggestions[0] || suggestion,
            qty: 1
          }]);
          setShowAddValidation(true);
          return;
        }
      } catch (validationError) {
        console.warn('Validation check failed, proceeding anyway:', validationError);
        // Continue with adding if validation fails (fallback)
      }
    }
    
    try {
      setAdding(true);
      const res = await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      
      const data = await res.json();
      if (data.ok) {
        setQ('');
        await loadWatchlist();
        try {
          const { toast } = await import('@/lib/toast-client');
          toast(`Added ${data.name || name} to watchlist`, 'success');
        } catch {}
      } else {
        try {
          const { toast } = await import('@/lib/toast-client');
          toast(data.error || 'Failed to add card', 'error');
        } catch {}
      }
    } catch (e: any) {
      try {
        const { toast } = await import('@/lib/toast-client');
        toast(e?.message || 'Add failed', 'error');
      } catch {}
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!isPro) { try { showProToast(); } catch {} return; }
    try {
      const res = await fetch('/api/watchlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (res.ok) {
        await loadWatchlist();
        try {
          const { toast } = await import('@/lib/toast-client');
          toast(`Removed ${name} from watchlist`, 'success');
        } catch {}
      }
    } catch (e: any) {
      try {
        const { toast } = await import('@/lib/toast-client');
        toast(e?.message || 'Remove failed', 'error');
      } catch {}
    }
  };

  return (
    <section className="rounded border border-neutral-800 p-3 space-y-2">
      <div className="font-medium flex items-center gap-2">
        Watchlist 
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span>
      </div>
      <div className="space-y-2">
        <label className="text-sm block">
          <div className="opacity-70 mb-1">Quick add</div>
          <CardAutocomplete
            value={q}
            onChange={setQ}
            onPick={(name) => {
              setQ(name);
              // Auto-add when picking from autocomplete
              setTimeout(() => {
                const btn = document.querySelector('[data-watchlist-add]') as HTMLButtonElement;
                btn?.click();
              }, 100);
            }}
            placeholder="Search cards..."
          />
        </label>
        <button 
          data-watchlist-add
          onClick={() => quickAdd()}
          disabled={adding || !q.trim()}
          className="w-full text-xs border rounded px-2 py-1 disabled:opacity-50 bg-blue-600 hover:bg-blue-500 transition-colors"
        >
          {adding ? 'Adding...' : 'Add to Watchlist'}
        </button>
      </div>
      {Array.isArray(items) && items.length > 0 && (
        <a 
          href="/watchlist" 
          className="text-xs text-blue-400 hover:text-blue-300 underline block"
        >
          → Go to full watchlist
        </a>
      )}
      {loading ? (
        <div className="text-xs opacity-70">Loading...</div>
      ) : (!Array.isArray(items) || items.length === 0) ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-dashed border-neutral-700 rounded-lg p-6 text-center"
        >
          <div className="text-5xl mb-3">🔮</div>
          <div className="font-medium text-sm mb-1">No tracked cards yet</div>
          <div className="text-xs opacity-70">Add your first spell above to monitor price changes!</div>
        </motion.div>
      ) : (
        <AnimatePresence>
          <ul className="space-y-2 max-h-[500px] overflow-y-auto">
            {(Array.isArray(items) ? items : []).slice(0, 10).map((item) => (
              <WatchlistCard
                key={item.id}
                item={item}
                imgMap={imgMap}
                onRemove={() => remove(item.id, item.name)}
                onAddToChart={() => setNames(names ? `${names.replace(/\s+$/,'')}, ${item.name}` : item.name)}
              />
            ))}
          </ul>
          {items.length > 10 && (
            <div className="text-xs opacity-70 pt-2 text-center">
              +{items.length - 10} more cards
            </div>
          )}
        </AnimatePresence>
      )}
      
      {/* Pre-add validation modal */}
      {showAddValidation && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => { setShowAddValidation(false); setAddValidationItems([]); }}>
          <div className="max-w-xl w-full rounded-xl border border-orange-700 bg-neutral-900 p-5 text-sm shadow-2xl" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">✏️</span>
              <h3 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                Fix Card Name Before Adding
              </h3>
            </div>
            <div className="mb-3 text-xs text-neutral-400">
              Found a card that needs fixing. Select the correct name from the dropdown:
            </div>
            <div className="space-y-2 mb-4">
              {addValidationItems.map((it, idx) => (
                <div key={`${it.originalName}-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600 transition-colors">
                  <div className="flex-1">
                    <div className="font-medium text-neutral-200 truncate">{it.originalName}</div>
                  </div>
                  <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <select value={it.choice} onChange={e=>setAddValidationItems(arr => { const next = arr.slice(); next[idx] = { ...it, choice: e.target.value }; return next; })}
                    className="bg-neutral-950 border border-neutral-600 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent min-w-[180px]">
                    {it.suggestions.map(s => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => { setShowAddValidation(false); setAddValidationItems([]); }} className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={async()=>{
                try {
                  const correctedName = addValidationItems[0]?.choice || addValidationItems[0]?.originalName;
                  if (!correctedName) return;
                  
                  setShowAddValidation(false);
                  setAddValidationItems([]);
                  
                  // Add with corrected name
                  await quickAdd(correctedName);
                } catch(e:any) {
                  alert(e?.message||'Failed to add card');
                }
              }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg">
                Apply Fixed Name & Add
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
});

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
