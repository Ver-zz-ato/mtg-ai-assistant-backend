"use client";

import * as React from "react";
import { capture } from "@/lib/ph";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { usePrefs } from "@/components/PrefsContext";

type Suggestion = {
  from: string;
  to: string;
  price_from: number;
  price_to: number;
  price_delta: number;
  rationale: string;
  confidence: number;
};

type RiskLevel = "low" | "medium" | "high";

type RoleInfo = { role: "ramp"|"draw"|"removal"|"wincon"|"other"; tier: "must_have"|"strong"|"nice_to_have"; uri?: string };

export default function BudgetSwapsClient() {
  const [deckText, setDeckText] = React.useState("");
  const { currency: globalCurrency, setCurrency: setGlobalCurrency } = usePrefs();
  const currency = (globalCurrency as any as "USD" | "EUR" | "GBP") || "USD";
  const setCurrency = (c: "USD" | "EUR" | "GBP") => setGlobalCurrency?.(c);
  const [budget, setBudget] = React.useState<number>(5);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Suggestion[]>([]);
  const [toast, setToast] = React.useState<string | null>(null);
  const [decks, setDecks] = React.useState<Array<{ id: string; title: string }>>([]);
  const [deckId, setDeckId] = React.useState<string>("");
  const [riskMap, setRiskMap] = React.useState<Record<string, { risk: RiskLevel; reason?: string }>>({});
  const [roleMap, setRoleMap] = React.useState<Record<string, RoleInfo>>({});
  const [imgMap, setImgMap] = React.useState<Record<string, { small?: string }>>({});
  const [pv, setPv] = React.useState<{ src: string; x: number; y: number; shown: boolean }>({ src: "", x: 0, y: 0, shown: false });
  const [useSnapshot, setUseSnapshot] = React.useState(false);
  const [snapshotDate, setSnapshotDate] = React.useState<string>(new Date().toISOString().slice(0,10));

  React.useEffect(() => {
    (async () => {
      try {
        const mod = await import("@/lib/pricePrefs");
        const { mode, snapshotDate } = mod.readPricePrefs();
        setUseSnapshot(mode === 'snapshot');
        setSnapshotDate(snapshotDate);
      } catch {}
    })();
  }, []);
  React.useEffect(() => {
    (async () => {
      try {
        const mod = await import("@/lib/pricePrefs");
        mod.writePricePrefs(useSnapshot ? 'snapshot' : 'live', snapshotDate);
      } catch {}
    })();
  }, [useSnapshot, snapshotDate]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createBrowserSupabaseClient();
        const { data: userRes } = await sb.auth.getUser();
        const uid = userRes?.user?.id;
        if (!uid) return;
        const { data } = await sb.from("decks").select("id, title, deck_text").eq("user_id", uid).order("created_at", { ascending: false });
        if (alive) setDecks((data as any[])?.map(d => ({ id: d.id, title: d.title })) || []);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t);
  }, [toast]);

  React.useEffect(() => {
    if (rows.length > 0 && !busy) {
      // auto-refresh when currency changes and we already have results
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  async function run() {
    // Profanity guard before work
    try {
      const { containsProfanity } = await import("@/lib/profanity");
      const lines = String(deckText||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      for (const l of lines) { if (containsProfanity(l)) { setError('Please remove offensive words from the deck text.'); return; } }
    } catch {}

    setBusy(true); setError(null); setRows([]);
    try {
      try { capture('swap_run', { currency, budget }); } catch {}
      const res = await fetch("/api/deck/swap-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckText, currency, budget, useSnapshot, snapshotDate }),
      });
      const j = await res.json();
      if (!res.ok || j?.ok === false) throw new Error(j?.error || res.statusText);
      const suggestions: Suggestion[] = j.suggestions || [];
      setRows(suggestions);
      try {
        const { getImagesForNames } = await import("@/lib/scryfall");
        const names = Array.from(new Set(suggestions.flatMap(s=>[s.from,s.to])));
        const m = await getImagesForNames(names);
        const obj:any = {}; m.forEach((v,k)=>{obj[k]={small:v.small};}); setImgMap(obj);
      } catch {}
      try { capture('swap_results', { count: suggestions.length }); } catch {}

      // Pull reprint risk for the replacement cards
      const names = Array.from(new Set(suggestions.map((s: Suggestion) => s.to))).filter(Boolean);
      if (names.length) {
        try {
          // Reprint risk (server)
          const rr = await fetch("/api/cards/reprint-risk", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cards: names.map(n => ({ name: n })) }),
          });
          const jj = await rr.json();
          if (rr.ok && jj?.ok && jj.risks) setRiskMap(jj.risks); else setRiskMap({});
        } catch { setRiskMap({}); }

        // Role/tier + link (client via Scryfall)
        try {
          const fetchCard = async (name: string) => {
            const r = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
            if (!r.ok) return null; return r.json();
          };
          const roleFromOracle = (oracle: string): RoleInfo => {
            const t = oracle || "";
            const drawRe = /draw a card|scry [1-9]/i;
            const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land|signet|talisman|sol ring/i;
            const killRe = /destroy target|exile target|counter target|damage to any target/i;
            if (rampRe.test(t)) return { role: "ramp", tier: "must_have" };
            if (drawRe.test(t)) return { role: "draw", tier: "strong" };
            if (killRe.test(t)) return { role: "removal", tier: "strong" };
            if (/overrun|extra turn|infinite|win the game|combo/i.test(t)) return { role: "wincon", tier: "strong" };
            return { role: "other", tier: "nice_to_have" };
          };
          const cards = await Promise.all(names.map(fetchCard));
          const map: Record<string, RoleInfo> = {};
          cards.forEach((c: any) => {
            if (!c) return; const name = String(c?.name || "");
            const oracle = c?.oracle_text || c?.card_faces?.[0]?.oracle_text || "";
            const info = roleFromOracle(oracle); info.uri = c?.uri || undefined;
            if (name) { map[name] = info; map[name.toLowerCase()] = info; }
          });
          setRoleMap(map);
        } catch { setRoleMap({}); }
      } else {
        setRiskMap({});
        setRoleMap({});
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setBusy(false); }
  }

  function applySwap(from: string, to: string) {
    const re = new RegExp(`(^|\\b)${from.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, 'ig');
    setDeckText(prev => prev.replace(re, to));
    setToast(`Replaced ${from} → ${to}`);
    try { capture('swap_applied', { from, to }); } catch {}
  }

  function exportCsv() {
    const header = 'From,To,From price,To price,Savings,Confidence';
    const lines = rows.map(r => [r.from, r.to, r.price_from, r.price_to, Math.max(0, r.price_from - r.price_to), Math.round((r.confidence||0)*100)+'%']);
    const csv = [header, ...lines.map(arr => arr.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'budget_swaps.csv';
    a.click();
    try { capture('swap_csv', { count: rows.length }); } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm opacity-80">Deck</label>
          <select className="w-full rounded-md border bg-black/20 px-3 py-2" value={deckId} onChange={async (e) => {
            const id = e.target.value; setDeckId(id);
            if (!id) return;
            try {
              const sb = createBrowserSupabaseClient();
              const { data } = await sb.from("decks").select("deck_text").eq("id", id).maybeSingle();
              if (data?.deck_text) setDeckText(String(data.deck_text));
            } catch {}
          }}>
            <option value="">— None (paste below) —</option>
            {decks.map(d => (<option key={d.id} value={d.id}>{d.title}</option>))}
          </select>

          <label className="block text-sm opacity-80">Deck text</label>
          <textarea
            className="w-full h-48 rounded-md border bg-black/20 px-3 py-2 font-mono text-sm"
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder="Paste a deck list here..."
          />
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm opacity-80">Currency</label>
            <select
              className="w-full rounded-md border bg-black/20 px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          {rows.length > 0 ? (
            <div className="text-xs opacity-70">Changing currency will re-run the search.</div>
          ) : null}
          <div>
            <label className="mt-2 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useSnapshot} onChange={(e)=>setUseSnapshot(e.target.checked)} />
              Use today’s snapshot prices
            </label>
          </div>
          <div>
            <label className="block text-sm opacity-80">Only suggest swaps for cards priced over</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-32 rounded-md border bg-black/20 px-3 py-2"
                value={budget}
                min={0}
                step={1}
                onChange={(e) => setBudget(Number(e.target.value || 0))}
              />
              <span className="text-sm">{currency}</span>
            </div>
          </div>
          <button onClick={run} disabled={busy} className={`w-full rounded-md px-4 py-2 text-black ${busy ? "bg-gray-300" : "bg-white hover:bg-gray-100"}`}>
            {busy ? "Finding swaps…" : "Find budget swaps"}
          </button>
        </div>
      </div>
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>
      )}

      {rows.length === 0 && !busy && (deckText.trim().length > 0 || deckId) && (
        <div className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3 text-sm text-neutral-300">
          No viable budget swaps found for your threshold in {currency}.
        </div>
      )}

      {/* Mode badge header */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div>
          {useSnapshot ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-700 text-amber-50">Using Snapshot {snapshotDate}</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-50">Live</span>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div>{rows.length} suggestion(s)</div>
          <button onClick={exportCsv} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Export CSV</button>
        </div>
      )}

      {rows.length > 0 && (
        <>
        <div className="text-xs text-neutral-400 flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> low reprint risk</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span> medium</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> high — consider waiting</span>
        </div>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-black/30">
              <tr className="border-b">
                <th className="text-left py-2 px-3 w-[42px]"></th>
                <th className="text-left py-2 px-3">From</th>
                <th className="text-left py-2 px-3 w-[42px]"></th>
                <th className="text-left py-2 px-3">To (cheaper)</th>
                <th className="text-right py-2 px-3">From price</th>
                <th className="text-right py-2 px-3">To price</th>
                <th className="text-right py-2 px-3">Savings</th>
                <th className="text-right py-2 px-3">Confidence</th>
                <th className="text-left py-2 px-3">Role</th>
                <th className="text-left py-2 px-3">Tier</th>
                <th className="text-left py-2 px-3">Link</th>
                <th className="text-right py-2 px-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={`${s.from}-${s.to}-${i}`} className="border-b">
                  <td className="py-1 px-3">{(() => { const key = s.from.toLowerCase(); const src = imgMap[key]?.small; return src ? (
                    <img src={src} alt={s.from} loading="lazy" decoding="async" className="w-[28px] h-[40px] object-cover rounded"
                      onMouseEnter={(e)=>setPv({ src: imgMap[key]?.small || src, x: (e as any).clientX, y: (e as any).clientY - 16, shown: true })}
                      onMouseMove={(e)=>setPv(p=>p.shown?{...p, x:(e as any).clientX, y:(e as any).clientY - 16}:p)}
                      onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                    />) : null; })()}</td>
                  <td className="py-1 px-3">{(() => { const key = s.to.toLowerCase(); const src = imgMap[key]?.small; return src ? (
                    <img src={src} alt={s.to} loading="lazy" decoding="async" className="w-[28px] h-[40px] object-cover rounded"
                      onMouseEnter={(e)=>setPv({ src: imgMap[key]?.small || src, x: (e as any).clientX, y: (e as any).clientY - 16, shown: true })}
                      onMouseMove={(e)=>setPv(p=>p.shown?{...p, x:(e as any).clientX, y:(e as any).clientY - 16}:p)}
                      onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                    />) : null; })()}</td>
                  <td className="py-1 px-3">{(() => { const key = s.to.toLowerCase(); const src = imgMap[key]?.small; return src ? (<img src={src} alt={s.to} loading="lazy" decoding="async" className="w-[28px] h-[40px] object-cover rounded" />) : null; })()}</td>
                  <td className="py-1 px-3">
                    <span className="inline-flex items-center gap-2">
                      {(() => { const r = riskMap?.[s.to]; const lvl = r?.risk as RiskLevel | undefined; const color = lvl==='low'?'bg-emerald-500':lvl==='medium'?'bg-amber-400':lvl==='high'?'bg-red-500':'bg-neutral-700'; const title = r?.reason ? `${lvl||'unknown'} risk: ${r.reason}` : (lvl? `${lvl} risk` : ''); return <span title={title} className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}></span>; })()}
                      <span>{s.to}</span>
                    </span>
                  </td>
                  <td className="py-1 px-3 text-right">{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(s.price_from)}</td>
                  <td className="py-1 px-3 text-right">{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(s.price_to)}</td>
                  <td className="py-1 px-3 text-right text-emerald-300">{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Math.max(0, s.price_from - s.price_to))}</td>
                  <td className="py-1 px-3 text-right">{Math.round((s.confidence || 0)*100)}%</td>
                  <td className="py-1 px-3"><span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs">{(roleMap?.[s.to] || roleMap?.[s.to.toLowerCase()])?.role || '—'}</span></td>
                  <td className="py-1 px-3"><span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs capitalize">{(((roleMap?.[s.to] || roleMap?.[s.to.toLowerCase()])?.tier) || '—').replace(/_/g,' ')}</span></td>
                  <td className="py-1 px-3"><a className="text-blue-300 hover:underline" href={(roleMap?.[s.to] || roleMap?.[s.to.toLowerCase()])?.uri || '#'} target="_blank" rel="noreferrer">Scryfall</a></td>
                  <td className="py-1 px-3 text-right">
                    <button onClick={() => applySwap(s.from, s.to)} className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs">Apply</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Global hover preview for card images */}
      {pv.shown && typeof window !== 'undefined' && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: pv.x, top: pv.y, transform: 'translate(-50%, -100%)' }}>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
            <img src={pv.src} alt="preview" className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" />
          </div>
        </div>
      )}
      {toast && (<div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-3 py-2 rounded" aria-live="polite">{toast}</div>)}
    </div>
  );
}
