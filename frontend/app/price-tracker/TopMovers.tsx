"use client";
import React from "react";
import { useProStatus } from "@/hooks/useProStatus";
import { showProToast } from "@/lib/pro-ux";
import { motion, AnimatePresence } from "framer-motion";
import { getImagesForNames } from "@/lib/scryfall-cache";

type MoverRow = { name: string; prior: number; latest: number; delta: number; pct: number };

type SortField = "name" | "prior" | "latest" | "delta" | "pct";
type SortDirection = "asc" | "desc";

interface TopMoversProps {
  currency: 'USD' | 'EUR' | 'GBP';
  onAddToChart?: (name: string) => void;
}

export default function TopMovers({ currency, onAddToChart }: TopMoversProps) {
  const { isPro } = useProStatus();
  const [rows, setRows] = React.useState<MoverRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [windowDays, setWindowDays] = React.useState(7);
  const [minPrice, setMinPrice] = React.useState(0);
  const [watchOnly, setWatchOnly] = React.useState(false);
  const [watch, setWatch] = React.useState<string[]>([]);
  const [isExpanded, setIsExpanded] = React.useState(true);
  const [sortField, setSortField] = React.useState<SortField>("pct");
  const [sortDir, setSortDir] = React.useState<SortDirection>("desc");
  const [imgMap, setImgMap] = React.useState<Record<string, { small?: string; normal?: string }>>({});
  const [priceTrends, setPriceTrends] = React.useState<Record<string, Array<{ date: string; unit: number }>>>({});
  const [hoverCard, setHoverCard] = React.useState<{ name: string; x: number; y: number } | null>(null);
  const [selectedCard, setSelectedCard] = React.useState<string | null>(null);
  const [aiInsight, setAiInsight] = React.useState<Record<string, string>>({});
  const [loadingInsight, setLoadingInsight] = React.useState<Record<string, boolean>>({});
  const [formatFilter, setFormatFilter] = React.useState<string>("");
  const [comparePeriod, setComparePeriod] = React.useState<boolean>(false);
  const [selectedForWatchlist, setSelectedForWatchlist] = React.useState<Set<string>>(new Set());

  const currSym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  // Load watchlist
  React.useEffect(() => {
    (async () => {
      try {
        const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
        const sb = createBrowserSupabaseClient();
        const { data: u } = await sb.auth.getUser();
        const arr = (u?.user?.user_metadata?.watchlist_cards || []) as any[];
        setWatch(Array.isArray(arr) ? arr.map(String) : []);
      } catch {}
    })();
  }, []);

  // Load movers data
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/price/movers?currency=${encodeURIComponent(currency)}&window_days=${windowDays}&limit=100`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (r.status === 429 && j?.proUpsell) {
          try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch {}
        }
        if (r.ok && j?.ok && Array.isArray(j.rows)) setRows(j.rows);
        else setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [currency, windowDays]);

  // Load card images
  React.useEffect(() => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    (async () => {
      try {
        const names = rows.slice(0, 50).map(r => r.name);
        const images = await getImagesForNames(names);
        const map: Record<string, { small?: string; normal?: string }> = {};
        images.forEach((info, key) => {
          map[key] = { small: info.small, normal: info.normal };
        });
        setImgMap(map);
      } catch {}
    })();
  }, [rows.map(r => r.name).join('|')]);

  // Load price trends for sparklines
  React.useEffect(() => {
    if (!isPro || !Array.isArray(rows) || rows.length === 0) return;
    (async () => {
      const names = rows.slice(0, 20).map(r => r.name);
      try {
        const params = new URLSearchParams();
        names.forEach(n => params.append('names[]', n));
        params.set('currency', currency);
        const from = new Date();
        from.setDate(from.getDate() - 30);
        params.set('from', from.toISOString().slice(0, 10));
        const r = await fetch(`/api/price/series?${params.toString()}`);
        const j = await r.json().catch(() => ({ ok: false }));
        if (r.ok && j?.ok && Array.isArray(j.series)) {
          const trends: Record<string, Array<{ date: string; unit: number }>> = {};
          for (const s of j.series) {
            if (s && s.name && Array.isArray(s.points)) {
              trends[s.name] = s.points.map((p: any) => ({ date: p.date, unit: Number(p.unit || 0) }));
            }
          }
          setPriceTrends(prev => ({ ...prev, ...trends }));
        }
      } catch {}
    })();
  }, [isPro, rows.map(r => r.name).join('|'), currency]);

  const filtered = React.useMemo(() => {
    if (!Array.isArray(rows)) return [];
    let result = rows.filter(r => r.latest >= (minPrice || 0));
    if (watchOnly) result = result.filter(r => watch.includes(r.name));
    return result;
  }, [rows, minPrice, watchOnly, watch]);

  const sorted = React.useMemo(() => {
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortField === "name") {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortField === "prior") {
        aVal = a.prior;
        bVal = b.prior;
      } else if (sortField === "latest") {
        aVal = a.latest;
        bVal = b.latest;
      } else if (sortField === "delta") {
        aVal = Math.abs(a.delta);
        bVal = Math.abs(b.delta);
      } else {
        aVal = Math.abs(a.pct);
        bVal = Math.abs(b.pct);
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const exportCSV = () => {
    const headers = ["Card", "Prior", "Latest", "Δ", "Δ%"];
    const rows = sorted.map(r => [
      r.name,
      r.prior.toFixed(2),
      r.latest.toFixed(2),
      r.delta.toFixed(2),
      (r.pct * 100).toFixed(1) + "%"
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `top-movers-${windowDays}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const addToWatchlist = async (name: string) => {
    if (!isPro) {
      try { showProToast(); } catch {}
      return;
    }
    try {
      const res = await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (data.ok) {
        setSelectedForWatchlist(prev => new Set(prev).add(name));
        try {
          const { toast } = await import('@/lib/toast-client');
          toast(`Added ${name} to watchlist`, 'success');
        } catch {}
      }
    } catch (e: any) {
      try {
        const { toastError } = await import('@/lib/toast-client');
        toastError(e?.message || 'Failed to add to watchlist');
      } catch {}
    }
  };

  const getAIInsight = async (name: string) => {
    if (aiInsight[name] || loadingInsight[name]) return;
    setLoadingInsight(prev => ({ ...prev, [name]: true }));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Why is the Magic: The Gathering card "${name}" experiencing price movement? Provide a brief 2-3 sentence explanation based on recent events, tournament results, reprints, or format changes.`,
          noUserInsert: true
        })
      });
      const data = await res.json();
      if (data.text) {
        setAiInsight(prev => ({ ...prev, [name]: data.text }));
      }
    } catch {}
    finally {
      setLoadingInsight(prev => ({ ...prev, [name]: false }));
    }
  };

  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-medium flex items-center gap-2">
          Top movers ({windowDays}d)
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 cursor-default" title="Cards with the biggest changes over the chosen window. Δ is absolute price change; Δ% is percentage change.">?</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={sorted.length === 0}
            className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors disabled:opacity-50"
            title="Export to CSV"
          >
            📊 Export
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors flex items-center gap-1"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? '▼' : '▶'} {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1">
              Window
              <select value={windowDays} onChange={e => setWindowDays(parseInt(e.target.value, 10))} className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5">
                <option value={1}>1d</option>
                <option value={7}>7d</option>
                <option value={30}>30d</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1">
              Min price
              <input type="number" min={0} step="0.5" value={minPrice} onChange={e => setMinPrice(Math.max(0, Number(e.target.value) || 0))} className="w-20 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-right" />
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={watchOnly} onChange={e => setWatchOnly(e.target.checked)} /> Watchlist only
            </label>
            {isPro && (
              <label className="inline-flex items-center gap-1">
                Format
                <select value={formatFilter} onChange={e => setFormatFilter(e.target.value)} className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5">
                  <option value="">All</option>
                  <option value="commander">Commander</option>
                  <option value="modern">Modern</option>
                  <option value="standard">Standard</option>
                  <option value="pioneer">Pioneer</option>
                </select>
              </label>
            )}
            {isPro && (
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={comparePeriod} onChange={e => setComparePeriod(e.target.checked)} /> Compare period
              </label>
            )}
            {sorted.length > 0 && (
              <span className="text-neutral-500 ml-auto">Showing {sorted.length} of {rows.length}</span>
            )}
          </div>

          {loading && <div className="text-xs opacity-70">Loading…</div>}
          {!loading && sorted.length === 0 && <div className="text-xs opacity-70">No movers for the selected filters.</div>}

          {!loading && sorted.length > 0 && (
            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-950 z-10">
                    <tr className="border-b border-neutral-800">
                      <th className="text-left py-2 px-3 font-semibold">
                        <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-blue-400 transition-colors">
                          Card {sortField === "name" && (sortDir === "asc" ? "↑" : "↓")}
                        </button>
                      </th>
                      <th className="text-right py-2 px-3 font-semibold">
                        <button onClick={() => handleSort("prior")} className="flex items-center gap-1 hover:text-blue-400 transition-colors ml-auto">
                          Prior {sortField === "prior" && (sortDir === "asc" ? "↑" : "↓")}
                        </button>
                      </th>
                      <th className="text-right py-2 px-3 font-semibold">
                        <button onClick={() => handleSort("latest")} className="flex items-center gap-1 hover:text-blue-400 transition-colors ml-auto">
                          Latest {sortField === "latest" && (sortDir === "asc" ? "↑" : "↓")}
                        </button>
                      </th>
                      {isPro && <th className="text-center py-2 px-3 font-semibold w-[80px]">Trend</th>}
                      <th className="text-right py-2 px-3 font-semibold">
                        <button onClick={() => handleSort("delta")} className="flex items-center gap-1 hover:text-blue-400 transition-colors ml-auto">
                          Δ {sortField === "delta" && (sortDir === "asc" ? "↑" : "↓")}
                        </button>
                      </th>
                      <th className="text-right py-2 px-3 font-semibold">
                        <button onClick={() => handleSort("pct")} className="flex items-center gap-1 hover:text-blue-400 transition-colors ml-auto">
                          Δ% {sortField === "pct" && (sortDir === "asc" ? "↑" : "↓")}
                        </button>
                      </th>
                      <th className="text-center py-2 px-3 font-semibold w-[100px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(r => {
                      const key = norm(r.name);
                      const img = imgMap[key];
                      const trend = priceTrends[r.name] || priceTrends[key];
                      const inWatchlist = watch.includes(r.name) || selectedForWatchlist.has(r.name);
                      return (
                        <React.Fragment key={r.name}>
                          <tr className="border-b border-neutral-900 hover:bg-neutral-900/50 transition-colors">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                {img?.small && (
                                  <img
                                    src={img.small}
                                    alt={r.name}
                                    className="w-8 h-11 object-cover rounded border border-neutral-700 cursor-pointer"
                                    onMouseEnter={(e) => img.normal && setHoverCard({ name: r.name, x: e.clientX, y: e.clientY })}
                                    onMouseMove={(e) => hoverCard?.name === r.name && setHoverCard({ name: r.name, x: e.clientX, y: e.clientY })}
                                    onMouseLeave={() => setHoverCard(null)}
                                  />
                                )}
                                <button
                                  onClick={() => onAddToChart?.(r.name)}
                                  className="font-mono text-sm hover:text-blue-400 transition-colors text-left"
                                  title="Click to add to price chart"
                                >
                                  {r.name}
                                </button>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right text-neutral-400">{currSym}{r.prior.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-medium">{currSym}{r.latest.toFixed(2)}</td>
                            {isPro && (
                              <td className="py-2 px-3 text-center">
                                {trend && trend.length >= 2 ? (
                                  <div className="inline-block" title={`${trend.length} days of data`}>
                                    <Sparkline data={trend.map(p => p.unit)} />
                                  </div>
                                ) : (
                                  <span className="text-xs text-neutral-600">—</span>
                                )}
                              </td>
                            )}
                            <td className={`py-2 px-3 text-right font-semibold ${r.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {r.delta >= 0 ? '+' : ''}{currSym}{Math.abs(r.delta).toFixed(2)}
                            </td>
                            <td className={`py-2 px-3 text-right font-semibold ${r.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {r.pct >= 0 ? '+' : ''}{(r.pct * 100).toFixed(1)}%
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center justify-center gap-1">
                                {isPro && (
                                  <button
                                    onClick={() => addToWatchlist(r.name)}
                                    disabled={inWatchlist}
                                    className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title={inWatchlist ? "Already in watchlist" : "Add to watchlist"}
                                  >
                                    {inWatchlist ? '✓' : '★'}
                                  </button>
                                )}
                                <button
                                  onClick={() => getAIInsight(r.name)}
                                  className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors"
                                  title="Why is this moving?"
                                >
                                  {loadingInsight[r.name] ? '…' : '💡'}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {aiInsight[r.name] && (
                            <tr className="border-b border-neutral-900 bg-blue-950/20">
                              <td colSpan={isPro ? 7 : 6} className="py-2 px-3 text-xs text-neutral-300">
                                <div className="flex items-start gap-2">
                                  <span className="text-blue-400">💡</span>
                                  <div className="flex-1">{aiInsight[r.name]}</div>
                                  <button onClick={() => setAiInsight(prev => { const next = { ...prev }; delete next[r.name]; return next; })} className="text-neutral-500 hover:text-neutral-300">×</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Card hover preview */}
      {hoverCard && imgMap[norm(hoverCard.name)]?.normal && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: hoverCard.x + 15, top: hoverCard.y - 10 }}
        >
          <motion.img
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            src={imgMap[norm(hoverCard.name)]?.normal}
            alt={hoverCard.name}
            className="w-64 rounded-lg shadow-2xl border-2 border-neutral-700"
          />
        </div>
      )}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-xs text-neutral-600">—</span>;
  const w = 60, h = 20;
  const min = Math.min(...data), max = Math.max(...data);
  const nx = (i: number) => i * (w / (data.length - 1));
  const ny = (v: number) => max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${nx(i)},${ny(v)}`).join(' ');
  const isRising = data[data.length - 1] > data[0];
  const color = isRising ? "#ef4444" : "#10b981";
  return (
    <svg width={w} height={h} className="inline-block">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      <path d={`${path} L ${w},${h} L 0,${h} Z`} fill={color} fillOpacity="0.1" />
    </svg>
  );
}

