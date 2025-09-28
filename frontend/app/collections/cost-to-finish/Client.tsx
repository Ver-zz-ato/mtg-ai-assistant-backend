"use client";

import * as React from "react";
import { capture } from "@/lib/ph";

import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { usePrefs } from "@/components/PrefsContext";

type Deck = { id: string; title: string; deck_text?: string | null };
type Collection = { id: string; name: string };

type ResultRow = {
  card: string;
  need: number;
  unit: number;
  subtotal: number;
  source?: string | null;
};

export default function CostToFinishClient() {
  React.useEffect(() => { try { capture('cost_to_finish_opened'); } catch {} }, []);
  const params = useSearchParams();
  const initialDeckId = params.get("deck") || "";
  const initialCollectionId = params.get("collectionId") || "";

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [decks, setDecks] = React.useState<Deck[]>([]);
  const [collections, setCollections] = React.useState<Collection[]>([]);

  const [deckId, setDeckId] = React.useState(initialDeckId);
  const [deckText, setDeckText] = React.useState("");
  const { currency: globalCurrency, setCurrency: setGlobalCurrency } = usePrefs();
  const currency = (globalCurrency as any as "USD" | "EUR" | "GBP") || "USD";
  const setCurrency = (c: "USD" | "EUR" | "GBP") => setGlobalCurrency?.(c);
  const [useOwned, setUseOwned] = React.useState(false);
  const [collectionId, setCollectionId] = React.useState<string>("");

  const [rows, setRows] = React.useState<ResultRow[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [pricesAt, setPricesAt] = React.useState<string | null>(null);

  // Snapshot pricing controls (shared prefs)
  const [useSnapshot, setUseSnapshot] = React.useState(false);
  const [snapshotDate, setSnapshotDate] = React.useState<string>(new Date().toISOString().slice(0,10));
  const [yesterdayDelta, setYesterdayDelta] = React.useState<number | null>(null);

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

  // Enriched shopping list view
  const [shopItems, setShopItems] = React.useState<Array<any>>([]);
  const [riskMap, setRiskMap] = React.useState<Record<string, { risk: "low"|"medium"|"high"; reason?: string }>>({});
  const [imgMap, setImgMap] = React.useState<Record<string, { small?: string; normal?: string }>>({});
  const [pv, setPv] = React.useState<{ src: string; x: number; y: number; shown: boolean }>({ src: "", x: 0, y: 0, shown: false });
  const shopTotal = React.useMemo(() => (shopItems || []).reduce((s: number, it: any) => s + (Number(it?.subtotal || 0) || 0), 0), [shopItems]);

  // Load decks & collections for the signed-in user
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = createBrowserSupabaseClient();
        const { data: userRes } = await sb.auth.getUser();
        const uid = userRes?.user?.id;
        if (!uid) return;

        // Decks
        const { data: deckData } = await sb
          .from("decks")
          .select("id, title")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (alive) setDecks(deckData as Deck[] ?? []);

        // Collections
        const { data: colData } = await sb
          .from("collections")
          .select("id, name")
          .eq("user_id", uid)
          .order("name", { ascending: true });

        if (alive) setCollections(colData as Collection[] ?? []);
      } catch (e) {
        /* ignore */
      }
    })();
    return () => { alive = false; };
  }, []);

  // If deep-linked with ?collectionId=, preselect and enable owned subtraction
  React.useEffect(() => {
    if (initialCollectionId) {
      setCollectionId(initialCollectionId);
      setUseOwned(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCollectionId]);

  // When a deck is chosen, fetch its text and paste it into the box
  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!deckId) return;
      try {
        const sb = createBrowserSupabaseClient();
        const { data, error } = await sb
          .from("decks")
          .select("deck_text")
          .eq("id", deckId)
          .single();
        if (!alive) return;
        if (!error && data?.deck_text) setDeckText(String(data.deck_text));
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [deckId]);

  // If user already has results, switching currency should recompute automatically
  React.useEffect(() => {
    if (rows.length > 0 && !busy) {
      onCompute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  async function onCompute() {
    try {
      setBusy(true);
      setError(null);
      setRows([]);

      // Profanity guard on free-form deck text
      try {
        const { containsProfanity } = await import("@/lib/profanity");
        const raw = String(deckText || "");
        const lines = raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
        for (const l of lines) { if (containsProfanity(l)) { setBusy(false); setError('Please remove offensive words from the deck text.'); return; } }
      } catch {}
      setTotal(null);
      setShopItems([]);
      setRiskMap({});

      const payload: any = {
        deckId: deckId || undefined,
        deckText: deckText || undefined,
        currency,
        useOwned,
      };
      if (useSnapshot) {
        payload.useSnapshot = true;
        payload.snapshotDate = snapshotDate;
      }
      if (useOwned && collectionId) payload.collectionId = collectionId;

      const res = await fetch("/api/collections/cost-to-finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json();
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || res.statusText);
      }
      setRows(j.rows ?? []);
      setTotal(typeof j.total === "number" ? j.total : null);
      setPricesAt(j.prices_updated_at || null);

      // If using snapshot, compute delta vs yesterday if available
      setYesterdayDelta(null);
      if (useSnapshot) {
        try {
          const y = new Date(snapshotDate);
          y.setDate(y.getDate() - 1);
          const ymd = y.toISOString().slice(0,10);
          const ypayload: any = { deckId: deckId || undefined, deckText: deckText || undefined, currency, useOwned };
          if (useOwned && collectionId) ypayload.collectionId = collectionId;
          ypayload.useSnapshot = true; ypayload.snapshotDate = ymd;
          const yr = await fetch("/api/collections/cost-to-finish", { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ypayload) });
          const yj = await yr.json().catch(()=>({}));
          if (yr.ok && yj?.ok && typeof yj.total === 'number' && typeof j.total === 'number') {
            setYesterdayDelta(Number(j.total) - Number(yj.total));
          }
        } catch {}
      }

      // Also fetch enriched shopping list for vendor view
      try {
        const payload: any = { deckId: deckId || undefined, deckText: deckText || undefined, currency, useOwned, collectionId: useOwned ? collectionId || undefined : undefined };
        const r = await fetch("/api/deck/shopping-list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const sj = await r.json();
        if (r.ok && sj?.ok && Array.isArray(sj.items)) {
          setShopItems(sj.items);
          const names = Array.from(new Set((sj.items as any[]).map(it => it.name))).filter(Boolean);
          if (names.length) {
            try {
              const rr = await fetch("/api/cards/reprint-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cards: names.map((n:string)=>({ name:n })) }) });
              const rj = await rr.json();
              if (rr.ok && rj?.ok && rj.risks) setRiskMap(rj.risks);
            } catch {}
            try {
              const { getImagesForNames } = await import("@/lib/scryfall");
              const m = await getImagesForNames(names);
              const obj: any = {}; m.forEach((v, k) => { obj[k] = { small: v.small, normal: v.normal }; });
              setImgMap(obj);
            } catch {}
          }
        }
      } catch {/* ignore */}
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Cost to Finish</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: deck pick + text */}
        <div className="space-y-3">
          <label className="block text-sm opacity-80">Choose one of your decks</label>
          <select
            className="w-full rounded-md border bg-black/20 px-3 py-2"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
          >
            <option value="">— None (paste below) —</option>
            {decks.map(d => (
              <option key={d.id} value={d.id}>{d.title}</option>
            ))}
          </select>

          <label className="block text-sm opacity-80">Deck text</label>
          <textarea
            className="w-full h-48 rounded-md border bg-black/20 px-3 py-2 font-mono text-sm"
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder="Paste a deck list here..."
          />
          <p className="text-xs opacity-70">
            Or deep-link a public deck with <code>?deck=&lt;id&gt;</code> in the URL.
          </p>
        </div>

        {/* Right: options */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm opacity-80">Collection</label>
            <div className="flex items-center gap-2">
              <select
                className="w-full rounded-md border bg-black/20 px-3 py-2"
                value={collectionId}
                disabled={!useOwned}
                onChange={(e) => setCollectionId(e.target.value)}
              >
                <option value="">— None —</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useOwned}
                onChange={(e) => setUseOwned(e.target.checked)}
              />
              Subtract cards I already own
            </label>
            <p className="text-xs opacity-70">
              We’ll price only the copies you still need to buy.
            </p>
          </div>

          <div>
            <label className="block text-sm opacity-80">Currency</label>
            <select
              className="w-full rounded-md border bg-black/20 px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as "USD" | "EUR" | "GBP")}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
            {rows.length > 0 ? (
              <div className="text-xs opacity-70 mt-1">Changing currency will recompute automatically.</div>
            ) : null}
          </div>

          <div>
            <label className="mt-2 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useSnapshot}
                onChange={(e) => setUseSnapshot(e.target.checked)}
              />
              Use today’s snapshot prices (faster, stable per-day)
            </label>
            {useSnapshot && (
              <div className="text-xs opacity-70 mt-1">Snapshot date: {snapshotDate}</div>
            )}
          </div>

          <button
            onClick={onCompute}
            disabled={busy}
            className={`w-full rounded-md px-4 py-2 text-black ${busy ? "bg-gray-300" : "bg-white hover:bg-gray-100"}`}
          >
            {busy ? "Computing…" : "Compute cost"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}

      {/* Export vendor-friendly shopping CSV */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div></div>
          <button
            onClick={async () => {
              try {
                const payload: any = { deckId, deckText, currency, useOwned, collectionId };
                const r = await fetch("/api/deck/shopping-list", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const j = await r.json();
                if (!r.ok || j?.ok === false) throw new Error(j?.error || "Export failed");
                const items = (j.items || []) as any[];
                const head = ["name","set","collector","qty","price_each","subtotal","currency","have_qty"];
                const esc = (s: string) => `"${String(s ?? '').replace(/"/g,'""')}"`;
                const lines = items.map(it => [it.name, it.set, it.collector_number, it.qty_to_buy, it.price_each, it.subtotal, it.currency, it.qty_have]);
                const csv = [head, ...lines].map(row => row.map(esc).join(",")).join("\r\n");
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'shopping_list.csv';
                a.click();
                URL.revokeObjectURL(a.href);
              } catch (e: any) {
                alert(e?.message || 'Export failed');
              }
            }}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
          >
            Export Shopping CSV
          </button>
        </div>
      )}

      {/* Mode badge header */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div>
          {useSnapshot ? (
            <span className="inline-flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-amber-700 text-amber-50">Using Snapshot {snapshotDate}</span>{yesterdayDelta!=null && (<span className={`text-xs ${yesterdayDelta>=0?'text-red-300':'text-emerald-300'}`}>{yesterdayDelta>=0?'+':''}{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(yesterdayDelta)}</span>)}</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-50">Live</span>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <>
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div>
            {useSnapshot ? (
              <>Using snapshot {snapshotDate}</>
            ) : pricesAt ? (
              <>Prices cached {Math.max(0, Math.floor((Date.now() - new Date(pricesAt).getTime())/3600000))}h ago</>
            ) : (
              <>Live pricing</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const list = rows.map(r => `× ${r.need} ${r.card}`).join('\n');
                navigator.clipboard?.writeText?.(list);
                try { capture('shopping_list_copied', { count: rows.length }); } catch {}
              }}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            >Copy shopping list</button>
            <button
              onClick={() => {
                const header = 'Card,Need,Unit,Subtotal,Source';
                const lines = rows.map(r => {
                  const unit = typeof r.unit === 'number' ? r.unit : 0;
                  const sub = typeof r.subtotal === 'number' ? r.subtotal : (unit * r.need);
                  const source = r.source ?? 'Scryfall';
                  const cells = [r.card, String(r.need), String(unit), String(sub), String(source)];
                  return cells.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',');
                });
                const csv = [header, ...lines].join('\r\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'cost_to_finish.csv';
                a.click();
                try { capture('shopping_list_csv', { count: rows.length }); } catch {}
              }}
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
            >Export CSV</button>
          </div>
        </div>

        {/* Enriched shopping list view */}
        {shopItems.length > 0 && (
          <div className="mt-6 space-y-2">
            <div className="text-sm font-medium">Shopping list (enriched)</div>
            <div className="text-xs text-neutral-400 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> low reprint risk</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span> medium</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> high — consider waiting</span>
            </div>
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="bg-black/30">
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 w-[42px]"></th>
                    <th className="text-left py-2 px-3">Card</th>
                    <th className="text-left py-2 px-3">Cheapest print</th>
                    <th className="text-right py-2 px-3">Qty</th>
                    <th className="text-right py-2 px-3">Unit</th>
                    <th className="text-right py-2 px-3">Subtotal</th>
                    <th className="text-left py-2 px-3">Source</th>
                    <th className="text-left py-2 px-3">Role</th>
                    <th className="text-left py-2 px-3">Tier</th>
                    <th className="text-left py-2 px-3">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => { const srcMap = new Map((rows||[]).map(r => [String(r.card||'').toLowerCase(), r.source || '']));
                    return shopItems.map((it, i) => {
                      const key = String(it.name||'').toLowerCase();
                      const src = srcMap.get(key) || (useSnapshot ? 'Snapshot' : 'Scryfall');
                      return (
                        <tr key={`${it.name}-${i}`} className="border-b">
                      <td className="py-1 px-3">
                        {(() => { const key = String(it.name||'').toLowerCase(); const src = imgMap[key]?.small; return src ? (
                          <img
                            src={src}
                            alt={it.name}
                            loading="lazy"
                            decoding="async"
                            className="w-[28px] h-[40px] object-cover rounded"
                            onMouseEnter={(e)=>setPv({ src: imgMap[key]?.normal || src, x: (e as any).clientX, y: (e as any).clientY - 16, shown: true })}
                            onMouseMove={(e)=>setPv(p=>p.shown?{...p, x:(e as any).clientX, y:(e as any).clientY - 16}:p)}
                            onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                          />) : null; })()}
                      </td>
                      <td className="py-1 px-3">
                        <span className="inline-flex items-center gap-2">
                          {(() => { const r = (riskMap as any)?.[it.name]; const lvl = r?.risk; const color = lvl==='low'?'bg-emerald-500':lvl==='medium'?'bg-amber-400':lvl==='high'?'bg-red-500':'bg-neutral-700'; const title = r?.reason ? `${lvl||'unknown'} risk: ${r.reason}` : (lvl? `${lvl} risk` : ''); return <span title={title} className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}></span>; })()}
                          <span>{it.name}</span>
                        </span>
                      </td>
                          <td className="py-1 px-3">{it.set?.toUpperCase()} #{it.collector_number}</td>
                          <td className="py-1 px-3 text-right">{it.qty_to_buy}</td>
                          <td className="py-1 px-3 text-right">{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(it.price_each)}</td>
                          <td className="py-1 px-3 text-right">{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(it.subtotal)}</td>
                          <td className="py-1 px-3"><span className={`px-1.5 py-0.5 rounded text-xs ${src==='Snapshot'?'bg-neutral-800':'bg-neutral-900'}`}>{src}</span></td>
                          <td className="py-1 px-3"><span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs">{it.role}</span></td>
                          <td className="py-1 px-3"><span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs capitalize">{it.tier.replace(/_/g,' ')}</span></td>
                          <td className="py-1 px-3"><a className="text-blue-300 hover:underline" href={it.scryfall_uri || '#'} target="_blank" rel="noreferrer">Scryfall</a></td>
                        </tr>
                      );
                    }); })()}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="py-2 px-3 font-medium" colSpan={4}>Grand total</td>
                    <td className="py-2 px-3 text-right font-medium">
                      {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(shopTotal)}
                    </td>
                    <td className="py-2 px-3 text-left">
                      {useSnapshot ? (
                        <span className="inline-flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs">Snapshot</span>{yesterdayDelta!=null && (<span className={`text-xs ${yesterdayDelta>=0?'text-red-300':'text-emerald-300'}`}>{yesterdayDelta>=0?'+':''}{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(yesterdayDelta)}</span>)}</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-neutral-900 text-xs">Live</span>
                      )}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
          </div>
        )}
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
    </div>
  );
}
