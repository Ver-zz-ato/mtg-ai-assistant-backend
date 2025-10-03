"use client";

import * as React from "react";
import { capture } from "@/lib/ph";

import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { usePrefs } from "@/components/PrefsContext";
import { usePro } from "@/components/ProContext";

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
  function DistributionCharts() {
    if (rowsToShow.length===0) return null;
    const buckets = { small:0, low:0, mid:0, high:0 } as any;
    for (const r of rowsToShow) {
      const u = Number(r.unit||0);
      if (u < 1) buckets.small += r.need||0; else if (u < 5) buckets.low += r.need||0; else if (u < 20) buckets.mid += r.need||0; else buckets.high += r.need||0;
    }
    const totalNeed = (buckets.small + buckets.low + buckets.mid + buckets.high) || 1;
    const pct = (n:number)=> Math.round(n/totalNeed*100);
    const rarCounts = { common:0, uncommon:0, rare:0, mythic:0 } as any;
    for (const r of rowsToShow) {
      const rr = rarityMap[String(r.card||'').toLowerCase()]||'';
      if (rr && rr in rarCounts) rarCounts[rr] += r.need||0;
    }
    return (
      <div className="mt-6 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-neutral-800 p-3">
          <div className="text-sm font-medium mb-2">By price bucket</div>
          {([['<$1',buckets.small],['$1–5',buckets.low],['$5–20',buckets.mid],['$20+',buckets.high]] as const).map(([label,val],i)=> (
            <div key={String(label)} className="mb-1">
              <div className="flex items-center justify-between text-xs"><span>{label}</span><span className="opacity-70">{pct(val as number)}%</span></div>
              <div className="h-1.5 rounded bg-neutral-800 overflow-hidden"><div className={`h-1.5 ${i===0?'bg-slate-400':i===1?'bg-sky-500':i===2?'bg-amber-500':'bg-rose-500'}`} style={{ width: `${pct(val as number)}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-neutral-800 p-3">
          <div className="text-sm font-medium mb-2">By rarity</div>
          {([['Common','common'],['Uncommon','uncommon'],['Rare','rare'],['Mythic','mythic']] as const).map(([label,key])=>{
            const count = rarCounts[key as any]||0; const p = pct(count);
            const color = key==='mythic'?'bg-orange-500':key==='rare'?'bg-yellow-500':key==='uncommon'?'bg-gray-400':'bg-neutral-500';
            return (
              <div key={key} className="mb-1">
                <div className="flex items-center justify-between text-xs"><span>{label}</span><span className="opacity-70">{p}%</span></div>
                <div className="h-1.5 rounded bg-neutral-800 overflow-hidden"><div className={`h-1.5 ${color}`} style={{ width: `${p}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
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
  const [rarityMap, setRarityMap] = React.useState<Record<string, string>>({});
  const [deckPreview, setDeckPreview] = React.useState<{ title?: string; commander?: string; art?: string } | null>(null);

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

  // Build image map for missing rows when rows change
  React.useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set((rows || []).map(r => r.card))).filter(Boolean) as string[];
        if (!names.length) { setImgMapRows({}); return; }
        const { getImagesForNames } = await import("@/lib/scryfall");
        const m = await getImagesForNames(names);
        const obj: any = {}; m.forEach((v, k) => { obj[k] = { small: v.small, normal: v.normal }; });
        setImgMapRows(obj);
      } catch { setImgMapRows({}); }
    })();
  }, [rows.map(r => r.card).join('|')]);
  const [riskMap, setRiskMap] = React.useState<Record<string, { risk: "low"|"medium"|"high"; reason?: string }>>({});
  const [imgMap, setImgMap] = React.useState<Record<string, { small?: string; normal?: string }>>({});
  const [imgMapRows, setImgMapRows] = React.useState<Record<string, { small?: string; normal?: string }>>({});
  const [pv, setPv] = React.useState<{ src: string; x: number; y: number; shown: boolean }>({ src: "", x: 0, y: 0, shown: false });
  const { isPro } = usePro();
  const [series, setSeries] = React.useState<Array<{ date:string; total:number }>>([]);
  const [excludeLands, setExcludeLands] = React.useState(false);
  const [isLandMap, setIsLandMap] = React.useState<Record<string, boolean>>({});
  const [catMap, setCatMap] = React.useState<Record<string, { ramp?: boolean; draw?: boolean; removal?: boolean; land?: boolean }>>({});
  const shopTotal = React.useMemo(() => (shopItems || []).reduce((s: number, it: any) => s + (Number(it?.subtotal || 0) || 0), 0), [shopItems]);
  const [whyMap, setWhyMap] = React.useState<Record<string, string>>({});
  const [whyBusy, setWhyBusy] = React.useState<Record<string, boolean>>({});
  const [swaps, setSwaps] = React.useState<Array<{ from:string; to:string; price_from?:number; price_to?:number; price_delta?:number }>>([]);
  const [swapsOpen, setSwapsOpen] = React.useState(false);
  const srcMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) { const k = String(r.card||'').toLowerCase(); m.set(k, r.source || ''); }
    return m;
  }, [rows.map(r=>r.card).join('|'), rows.map(r=>r.source||'').join('|')]);

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

  // Pro sparkline fetch
  React.useEffect(() => {
    (async () => {
      try {
        setSeries([]);
        if (!isPro || !deckId) return;
        const d = new Date();
        const from = new Date(d.getTime() - 29*24*3600*1000).toISOString().slice(0,10);
        const r = await fetch(`/api/price/deck-series?deck_id=${encodeURIComponent(deckId)}&currency=${encodeURIComponent(currency)}&from=${from}`);
        const j = await r.json().catch(()=>({}));
        if (r.ok && j?.ok && Array.isArray(j.points)) setSeries(j.points);
      } catch { setSeries([]); }
    })();
  }, [isPro, deckId, currency]);

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
      if (!deckId) { setDeckPreview(null); return; }
      try {
        const sb = createBrowserSupabaseClient();
        const { data, error } = await sb
          .from("decks")
          .select("deck_text, title, commander")
          .eq("id", deckId)
          .single();
        if (!alive) return;
        if (!error && data) {
          if (data.deck_text) setDeckText(String(data.deck_text));
          const title = String(data.title || '').trim();
          // Commander: prefer explicit column; else derive from first non-empty deck line like RecentDecksStrip
          let commander = String((data as any).commander || '').trim();
          if (!commander) {
            try {
              const raw = String(data.deck_text || '');
              const first = raw.split(/\r?\n/).map(s=>s.trim()).find(Boolean) || title;
              const m0 = first.match(/^(\d+)\s*[xX]?\s+(.+)$/);
              commander = (m0 ? m0[2] : first).replace(/\s*\(.*?\)\s*$/, '').trim();
            } catch {}
          }
          let art: string | undefined;
          // Prefer server-side banner-art API (uses cached scryfall, deck cards, robust fallbacks)
          try {
            const r = await fetch(`/api/profile/banner-art?signatureDeckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
            const j = await r.json().catch(()=>({ ok:false }));
            if (r.ok && j?.ok && j.art) art = String(j.art);
          } catch {}
          // Fallback to direct commander image fetch if server route fails
          if (!art && commander) {
            try {
              const { getImagesForNames } = await import("@/lib/scryfall");
              const names = [commander];
              const m = await getImagesForNames(names);
              const key = names[0]?.toLowerCase()?.normalize('NFKD')?.replace(/[\u0300-\u036f]/g,'')?.replace(/\s+/g,' ')?.trim();
              const img = key ? m.get(key) : null;
              art = img?.art_crop || img?.normal || img?.small;
            } catch {}
          }
          setDeckPreview({ title, commander, art });
        }
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
    // Require a deck or text; show a polite toast instead of failing
    if (!deckId && !String(deckText||'').trim()) {
      try { const { toastError } = await import('@/lib/toast-client'); toastError('Please select a deck or paste a decklist first.'); } catch { alert('Please select a deck or paste a decklist first.'); }
      return;
    }
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
      const nextRows: ResultRow[] = j.rows ?? [];
      setRows(nextRows);
      setTotal(typeof j.total === "number" ? j.total : null);
      setPricesAt(j.prices_updated_at || null);

      // Fetch rarity and lightweight categories for missing cards (style + filters)
      try {
        const unique = Array.from(new Set(nextRows.map(r => String(r.card||'').trim()))).slice(0, 80);
        const pairs = await Promise.all(unique.map(async (name) => {
          try {
            const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, { cache:'no-store' });
            if (!r.ok) return { name, rarity:'', land:false, ramp:false, draw:false, removal:false };
            const j = await r.json().catch(()=>({}));
            const rarity = String(j?.rarity || '').toLowerCase();
            const type_line = String(j?.type_line||'');
            const oracle = String(j?.oracle_text||'');
            const land = /\bLand\b/i.test(type_line);
            const draw = /draw a card|scry [1-9]/i.test(oracle);
            const ramp = /add \{[wubrg]\}|search your library for (a|up to .*?) land|signet|talisman|sol ring/i.test(oracle + ' ' + (j?.name||''));
            const removal = /destroy target|exile target|counter target/i.test(oracle);
            return { name, rarity, land, ramp, draw, removal };
          } catch { return { name, rarity:'', land:false, ramp:false, draw:false, removal:false }; }
        }));
        const rm: Record<string,string> = {};
        const lm: Record<string, boolean> = {};
        const cm: Record<string, { ramp?: boolean; draw?: boolean; removal?: boolean; land?: boolean }> = {};
        for (const row of pairs) {
          const key = row.name.toLowerCase();
          rm[key] = row.rarity;
          lm[key] = !!row.land;
          cm[key] = { ramp: row.ramp, draw: row.draw, removal: row.removal, land: row.land };
        }
        setRarityMap(rm);
        setIsLandMap(lm);
        setCatMap(cm);
      } catch {}

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

  const rowsToShow = React.useMemo(() => rows.filter(r => {
    const key = String(r.card||'').toLowerCase();
    if (excludeLands && isLandMap[key]) return false;
    return true;
  }), [rows.map(r=>r.card).join('|'), excludeLands, Object.keys(isLandMap).length]);

  return (
    <div className="mx-auto w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6 space-y-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-[5] bg-neutral-950/85 backdrop-blur border-b border-neutral-800 -mx-4 px-4 py-3">
        <div className="w-full">
          <div className="text-lg font-semibold">Cost to Finish</div>
          <div className="text-[12px] opacity-80">Find out exactly what it’ll cost to finish your deck — using your collection and live card prices.</div>
          {!isPro && (
            <div className="mt-2 text-[11px]"><span className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span> Trend sparkline, Budget swaps, and Moxfield/MTGO exports are Pro features.</div>
          )}
        </div>
      </div>

      <div className="w-full space-y-6 xl:space-y-0 xl:flex xl:gap-6 2xl:gap-8 items-start">
        {/* Left: form inputs */}
        <div className="space-y-3 w-full xl:w-[320px] 2xl:w-[340px] shrink-0 relative z-10">
          {deckPreview && (
            <div className="relative overflow-hidden rounded-xl border border-violet-700/60">
              {/* Background commander art */}
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: deckPreview.art ? `url(${deckPreview.art})` : undefined }} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
              <div className="relative flex items-center gap-3 p-3">
                {deckPreview.art ? (
                  <img src={deckPreview.art} alt="commander" width={56} height={56} className="rounded-md object-cover border border-neutral-800" />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-neutral-900 border border-neutral-800" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate text-white drop-shadow">{deckPreview.title || 'Selected deck'}</div>
                  {deckPreview.commander && (<div className="text-xs opacity-90 truncate text-white drop-shadow">Commander: {deckPreview.commander}</div>)}
                </div>
              </div>
            </div>
          )}
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

          {/* Collection & pricing selectors */}
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
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-sm opacity-80">Currency</label>
              <select
                className="w-40 rounded-md border bg-black/20 px-3 py-2"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "USD" | "EUR" | "GBP")}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <label className="inline-flex items-center gap-2 text-sm mt-5">
              <input type="checkbox" checked={useSnapshot} onChange={(e)=>setUseSnapshot(e.target.checked)} />
              Use today’s snapshot prices
            </label>
            <label className="inline-flex items-center gap-2 text-sm mt-5">
              <input type="checkbox" checked={excludeLands} onChange={(e)=>setExcludeLands(e.target.checked)} />
              Exclude lands
            </label>
          </div>

          <button
            onClick={onCompute}
            disabled={busy}
            className={`w-full rounded-md px-4 py-2 ${busy ? "bg-sky-300/60" : "bg-sky-500 hover:bg-sky-400"} text-black font-semibold`}
          >
            {busy ? "Computing…" : "Compute cost"}
          </button>
        </div>

        {/* Right: results panel */}
        <div className="flex-1 min-w-0 w-full max-w-none relative z-20">
          <div className="space-y-3 w-full min-w-0 xl:max-w-[1100px] 2xl:max-w-[1300px] mx-auto">
          {/* Summary card */}
          {rowsToShow.length>0 && (
            <div className="w-full max-w-none min-w-0 rounded-xl border border-emerald-700/60 bg-neutral-950 p-4 sm:p-5 lg:p-6">
              <div className="text-sm font-semibold mb-2">Summary</div>
              {(() => {
                const missing = rowsToShow.reduce((s, r)=> s + Number(r.need||0), 0);
                const biggest = rowsToShow.slice().sort((a,b)=>(b.unit||0)-(a.unit||0))[0];
                const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$');
                const sparkSvg = (() => {
                  if (!isPro || series.length === 0) return null;
                  const w = 180, h = 40, pad = 3;
                  const vals = series.map(p=>Number(p.total||0));
                  const min = Math.min(...vals), max = Math.max(...vals);
                  const nx = (i:number)=> pad + i*(w-2*pad)/Math.max(1, series.length-1);
                  const ny = (v:number)=> h-pad - (max===min? 0 : (v-min)*(h-2*pad)/(max-min));
                  const dpath = series.map((p,i)=> `${i===0?'M':'L'} ${nx(i)},${ny(Number(p.total||0))}`).join(' ');
                  return (
                    <svg width={w} height={h} className="block">
                      <path d={dpath} fill="none" stroke="#10b981" strokeWidth={1.5} />
                    </svg>
                  );
                })();
                const computedTotal = rowsToShow.reduce((s, r)=> s + (Number(r.unit||0)*Number(r.need||0)), 0);
                const cats = (() => {
                  const acc = { land:0, ramp:0, draw:0, removal:0 } as Record<string, number>;
                  for (const r of rowsToShow) {
                    const key = String(r.card||'').toLowerCase();
                    const cat = catMap[key] || {};
                    if (cat.land) acc.land += Number(r.need||0);
                    if (cat.ramp) acc.ramp += Number(r.need||0);
                    if (cat.draw) acc.draw += Number(r.need||0);
                    if (cat.removal) acc.removal += Number(r.need||0);
                  }
                  return acc;
                })();
                return (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border border-neutral-800 p-2">
                      <div className="opacity-70 text-[11px]">Missing</div>
                      <div className="text-lg font-bold">{missing}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 p-2">
                      <div className="opacity-70 text-[11px]">Total cost</div>
                      <div className="text-lg font-bold">{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(computedTotal)}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 p-2">
                      <div className="opacity-70 text-[11px]">Biggest card</div>
                      <div className="text-lg font-bold truncate">{biggest?.card || '—'} <span className="text-[12px] opacity-80">{sym}{(biggest?.unit||0).toFixed(2)}</span></div>
                    </div>
                    <div className="col-span-3 flex items-center justify-between mt-1">
                      <div className="text-[11px] opacity-70">Last 30 days {isPro ? '(Pro)' : (<span className="inline-flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span></span>)}</div>
                      {sparkSvg}
                    </div>
                    <div className="col-span-3 mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        ['Lands', cats.land],
                        ['Ramp', cats.ramp],
                        ['Draw', cats.draw],
                        ['Removal', cats.removal],
                      ].map(([label, val]) => (
                        <div key={String(label)} className="rounded-lg border border-neutral-800 p-2 flex items-center justify-between">
                          <div className="opacity-70 text-[11px]">{label}</div>
                          <div className="text-base font-semibold">{val as number}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Distribution charts */}
          <div className="w-full max-w-none min-w-0"><DistributionCharts /></div>

          {/* Export for vendor list (shopping) */}
          {shopItems.length > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <div></div>
              <div>
                <button
                  onClick={async () => {
                    try {
                      const payload: any = { deckId, deckText, currency, useOwned, collectionId };
                      const r = await fetch("/api/deck/shopping-list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
                      const j = await r.json();
                      if (!r.ok || j?.ok === false) throw new Error(j?.error || "Export failed");
                      const items = (j.items || []) as any[];
                      const head = ["name","set","collector","qty","price_each","subtotal","currency","have_qty"];
                      const esc = (s: string) => '"' + String(s ?? '').split('"').join('""') + '"';
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
                <button
                  onClick={() => {
                    // Export simple missing list (Card,Qty) CSV — Free
                    try{
                      const header = 'Card,Qty';
                      const lines = rowsToShow.map(r=> `${'"'+String(r.card).replace(/"/g,'""')+'"'},${r.need}`);
                      const csv = [header, ...lines].join('\r\n');
                      const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
                      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='missing_list.csv'; a.click(); URL.revokeObjectURL(a.href);
                    } catch(e:any){ alert(e?.message||'Export failed'); }
                  }}
                  className="ml-2 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">
                  Export Missing CSV
                </button>
                <button
                  onClick={async () => {
                    try {
                      const uniques = rows.filter(r=> (r.need||0)>0).map(r=> ({ name: r.card, qty: r.need }));
                      for (const it of uniques) {
                        await fetch('/api/wishlists/add', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names:[it.name], qty: it.qty }) });
                      }
                      try { const { toast } = await import('@/lib/toast-client'); toast('Added missing to Wishlist', 'success'); } catch {}
                    } catch (e:any) { try { const { toastError } = await import('@/lib/toast-client'); toastError(e?.message||'Failed to add'); } catch { alert(e?.message||'Failed to add'); } }
                  }}
                  className="ml-2 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">
                  Add missing → Wishlist
                </button>
                {/* PRO buttons */}
                <button
                  onClick={async () => {
                    if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature.'); } return; }
                    // Export Moxfield-friendly missing list (.txt) lines: qty name
                    try{
                      const lines = rowsToShow.map(r=> `${r.need} ${r.card}`);
                      const txt = lines.join('\n'); const blob = new Blob([txt], { type:'text/plain;charset=utf-8' });
                      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='missing_moxfield.txt'; a.click(); URL.revokeObjectURL(a.href);
                    } catch(e:any){ alert(e?.message||'Export failed'); }
                  }}
                  className="ml-2 px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800">
                  Export → Moxfield (Pro)
                </button>
                <button
                  onClick={async () => {
                    if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature.'); } return; }
                    // MTGO text export follows "n Name" lines as well
                    try{
                      const lines = rowsToShow.map(r=> `${r.need} ${r.card}`);
                      const txt = lines.join('\n'); const blob = new Blob([txt], { type:'text/plain;charset=utf-8' });
                      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='missing_mtgo.txt'; a.click(); URL.revokeObjectURL(a.href);
                    } catch(e:any){ alert(e?.message||'Export failed'); }
                  }}
                  className="ml-2 px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800">
                  Export → MTGO (Pro)
                </button>
                <button
                  onClick={async () => {
                    if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature.'); } return; }
                    try{
                      const body:any = { deckText, currency, useSnapshot, snapshotDate };
                      const r = await fetch('/api/deck/swap-suggestions', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
                      const j = await r.json().catch(()=>({}));
                      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Swap suggestions failed');
                      const sugs = Array.isArray(j?.suggestions)? j.suggestions: [];
                      setSwaps(sugs); setSwapsOpen(true);
                    } catch(e:any){ alert(e?.message||'Suggestions failed'); }
                  }}
                  className="ml-2 px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-black">
                  Suggest budget swaps (Pro)
                </button>
              </div>
            </div>
          )}

          {/* Enriched shopping list view */}
          {shopItems.length > 0 && (
            <div className="mt-2 w-full max-w-none min-w-0">
              <div className="text-sm font-medium">Shopping list</div>
              {/* table copied from below */}
              <div className="w-full max-w-none min-w-0 rounded-xl border">
                <div className="relative w-full min-w-0 overflow-x-auto xl:overflow-x-visible px-2 sm:px-3 lg:px-4">
                  <table className="w-full table-auto text-sm">
                    <thead className="bg-black/30">
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 w-[42px] align-middle"></th>
                        <th className="text-left py-2 px-3 align-middle whitespace-normal break-words">Card</th>
                        <th className="text-left py-2 px-3 align-middle whitespace-normal break-words">Cheapest print</th>
                        <th className="text-right py-2 px-3 align-middle whitespace-normal break-words">Qty</th>
                        <th className="text-right py-2 px-3 align-middle whitespace-normal break-words">Unit</th>
                        <th className="text-right py-2 px-3 align-middle whitespace-normal break-words">Subtotal</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Source</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Role</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Tier</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Link</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Why</th>
                      </tr>
                    </thead>
                    <tbody>

                  {shopItems.map((it, i) => {
                      const key = String(it.name||'').toLowerCase();
                      const src = srcMap.get(key) || (useSnapshot ? 'Snapshot' : 'Scryfall');
                      const name = String(it.name||'');
                      return (
                        <React.Fragment key={`${name}-${i}`}>
                          <tr className="border-b">
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
                          <td className="py-1 px-3 align-middle whitespace-normal break-words">
                              <span className="inline-flex items-center gap-2 min-w-0">
                                {(() => { const r = (riskMap as any)?.[it.name]; const lvl = r?.risk; const color = lvl==='low'?'bg-emerald-500':lvl==='medium'?'bg-amber-400':lvl==='high'?'bg-red-500':'bg-neutral-700'; const title = r?.reason ? `${lvl||'unknown'} risk: ${r.reason}` : (lvl? `${lvl} risk` : ''); return <span title={title} className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}></span>; })()}
                                <span className="min-w-0 truncate" title={it.name}>{it.name}</span>
                              </span>
                            </td>
                            <td className="py-1 px-3 align-middle whitespace-normal break-words">{it.set?.toUpperCase()} #{it.collector_number}</td>
                            <td className="py-1 px-3 text-right align-middle whitespace-normal break-words">{it.qty_to_buy}</td>
                            <td className="py-1 px-3 text-right align-middle whitespace-normal break-words">{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(it.price_each)}</td>
                            <td className="py-1 px-3 text-right align-middle whitespace-normal break-words">{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(it.subtotal)}</td>
                            <td className="hidden 2xl:table-cell py-1 px-3 align-middle whitespace-normal break-words">
                              <div className="flex flex-wrap gap-1 min-w-0 max-w-full">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${src==='Snapshot'?'bg-neutral-800':'bg-neutral-900'} max-w-full`}>{src}</span>
                              </div>
                            </td>
                            <td className="hidden 2xl:table-cell py-1 px-3 align-middle whitespace-normal break-words">
                              <div className="flex flex-wrap gap-1 min-w-0 max-w-full">
                                <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs max-w-full">{it.role}</span>
                              </div>
                            </td>
                            <td className="hidden 2xl:table-cell py-1 px-3 align-middle whitespace-normal break-words">
                              <div className="flex flex-wrap gap-1 min-w-0 max-w-full">
                                <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs capitalize max-w-full">{it.tier.replace(/_/g,' ')}</span>
                              </div>
                            </td>
                            <td className="hidden 2xl:table-cell py-1 px-3 align-middle whitespace-normal break-words"><a className="text-blue-300 hover:underline" href={it.scryfall_uri || '#'} target="_blank" rel="noreferrer">Scryfall</a></td>
                            <td className="hidden 2xl:table-cell py-1 px-3 align-middle whitespace-normal break-words">
                              <button className="text-xs underline" onClick={async()=>{
                                if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature.'); } return; }
                                if (whyBusy[name]) return;
                                setWhyBusy(p=>({ ...p, [name]: true }));
                                try {
                                  const text = `In one short paragraph, explain why the card \"${name}\" is useful for this specific deck. Be concrete and avoid fluff.\n\nDeck list:\n${deckText || ''}`.slice(0, 4000);
                                  const r = await fetch('/api/chat', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ text, noUserInsert: true, prefs: { plan: 'Optimized' } }) });
                                  const j = await r.json().catch(()=>({}));
                                  const out = (j?.text || '').toString();
                                  if (out) setWhyMap(m=>({ ...m, [name]: out }));
                                } catch (e:any) { try { const { toastError } = await import('@/lib/toast-client'); toastError(e?.message||'Explain failed'); } catch { alert(e?.message||'Explain failed'); } }
                                finally { setWhyBusy(p=>({ ...p, [name]: false })); }
                              }}>{whyBusy[name] ? '…' : 'Why?'}</button>
                            </td>
                          </tr>
                          {whyMap[name] && (
                            <tr className="border-b">
                              <td colSpan={11} className="py-2 px-3 text-xs text-neutral-300 bg-neutral-900/40">
                                {whyMap[name]}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
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

        {/* Swaps panel (Pro) */}
        {swapsOpen && (
          <div className="mt-4 w-full min-w-0 rounded-xl border border-neutral-800 bg-neutral-950 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Budget swap suggestions (Pro)</div>
              <button className="text-xs underline" onClick={()=>setSwapsOpen(false)}>Close</button>
            </div>
            <div className="mt-2 text-xs text-neutral-300 space-y-1">
              {swaps.length===0 && (<div>No suggestions found for current budget threshold.</div>)}
              {swaps.map((s, i)=> (
                <div key={`sw-${i}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{s.from}</span>
                  <span>→</span>
                  <span className="font-mono">{s.to}</span>
                  <span className="opacity-70">({currency} {Number(s.price_from||0).toFixed(2)} → {Number(s.price_to||0).toFixed(2)})</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
        </div>
      </div>

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
