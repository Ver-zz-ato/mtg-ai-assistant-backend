"use client";

import * as React from "react";
import { capture } from "@/lib/ph";
import { trackApiCall, trackPerformance } from '@/lib/analytics-performance';
import FixDeckNamesModal from "@/components/FixDeckNamesModal";

import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { usePrefs } from "@/components/PrefsContext";
import { useProStatus } from "@/hooks/useProStatus";
import { useAuth } from "@/lib/auth-context";
import { track } from "@/lib/analytics/track";
import { useToast } from "@/components/ToastProvider";

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
  const { showPanel: showToastPanel, removeToast } = useToast();
  const { user } = useAuth();
  
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
    const normalize = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['']/g, "'").trim();
    for (const r of rowsToShow) {
      const cardName = normalize(String(r.card||''));
      const rr = rarityMap[cardName]||'';
      if (rr && rr in rarCounts) rarCounts[rr] += r.need||0;
    }
    console.log('[DistributionCharts] Rarity counts:', rarCounts, 'from', rowsToShow.length, 'rows');
    console.log('[DistributionCharts] RarityMap has', Object.keys(rarityMap).length, 'entries');
    if (Object.keys(rarityMap).length > 0 && rarCounts.common === 0 && rarCounts.uncommon === 0 && rarCounts.rare === 0 && rarCounts.mythic === 0) {
      console.warn('[DistributionCharts] RarityMap populated but no matches!');
      console.log('[DistributionCharts] First card from rowsToShow:', rowsToShow[0]?.card, '→ normalized:', normalize(rowsToShow[0]?.card || ''));
      console.log('[DistributionCharts] First 3 keys from rarityMap:', Object.keys(rarityMap).slice(0, 3));
    } else if (Object.keys(rarityMap).length > 0) {
      console.log('[DistributionCharts] ✅ Rarity matching working!');
    }
    return (
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-emerald-700/40 bg-neutral-950 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">💵</span>
            <div className="text-base font-bold">By Price Bucket</div>
          </div>
          {([['<$1',buckets.small],['$1–5',buckets.low],['$5–20',buckets.mid],['$20+',buckets.high]] as const).map(([label,val],i)=> (
            <div key={String(label)} className="mb-1">
              <div className="flex items-center justify-between text-xs"><span>{label}</span><span className="opacity-70">{pct(val as number)}%</span></div>
              <div className="h-1.5 rounded bg-neutral-800 overflow-hidden"><div className={`h-1.5 ${i===0?'bg-slate-400':i===1?'bg-sky-500':i===2?'bg-amber-500':'bg-rose-500'}`} style={{ width: `${pct(val as number)}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-amber-700/40 bg-neutral-950 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">✨</span>
            <div className="text-base font-bold">By Rarity</div>
          </div>
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
  const params = useSearchParams();
  const initialDeckId = params.get("deck") || "";
  const initialCollectionId = params.get("collectionId") || "";
  
  const { currency: globalCurrency, setCurrency: setGlobalCurrency } = usePrefs();
  const currency = (globalCurrency as any as "USD" | "EUR" | "GBP") || "USD";
  
  React.useEffect(() => { 
    try { 
      capture('cost_to_finish_opened', {
        initial_deck_id: initialDeckId,
        initial_collection_id: initialCollectionId,
        currency
      }); 
    } catch {} 
  }, [initialDeckId, initialCollectionId, currency]);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [decks, setDecks] = React.useState<Deck[]>([]);
  const [collections, setCollections] = React.useState<Collection[]>([]);

  const [deckId, setDeckId] = React.useState(initialDeckId);
  const [deckText, setDeckText] = React.useState("");
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
  const [shopItemsLoading, setShopItemsLoading] = React.useState(false);
  const [shopItemsHasMore, setShopItemsHasMore] = React.useState(false);
  const shopListEndRef = React.useRef<HTMLDivElement>(null);
  const resultsRef = React.useRef<HTMLDivElement>(null);

  // Build image map for missing rows when rows change
  React.useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set((rows || []).map(r => r.card))).filter(Boolean) as string[];
        if (!names.length) { setImgMapRows({}); return; }
        
        // Use server-side API to avoid CORS issues
        const response = await fetch('/api/cards/batch-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names })
        });
        
        if (!response.ok) {
          setImgMapRows({});
          return;
        }
        
        const result = await response.json();
        const obj: any = {};
        
        if (Array.isArray(result.data)) {
          result.data.forEach((card: any) => {
            const key = card.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
            obj[key] = {
              small: card.image_uris?.small,
              normal: card.image_uris?.normal
            };
          });
        }
        
        setImgMapRows(obj);
      } catch { setImgMapRows({}); }
    })();
  }, [rows.map(r => r.card).join('|')]);
  const [riskMap, setRiskMap] = React.useState<Record<string, { risk: "low"|"medium"|"high"; reason?: string }>>({});
  const [imgMap, setImgMap] = React.useState<Record<string, { small?: string; normal?: string }>>({});
  const [imgMapRows, setImgMapRows] = React.useState<Record<string, { small?: string; normal?: string }>>({});
  const [pv, setPv] = React.useState<{ src: string; x: number; y: number; shown: boolean; price?: number; cardName?: string; scryfallUri?: string }>({ src: "", x: 0, y: 0, shown: false });
  const { isPro } = useProStatus();
  const [series, setSeries] = React.useState<Array<{ date:string; total:number }>>([]);
  const [excludeLands, setExcludeLands] = React.useState(false);
  const [isLandMap, setIsLandMap] = React.useState<Record<string, boolean>>({});
  const [catMap, setCatMap] = React.useState<Record<string, { ramp?: boolean; draw?: boolean; removal?: boolean; land?: boolean }>>({});
  const shopTotal = React.useMemo(() => (shopItems || []).reduce((s: number, it: any) => s + (Number(it?.subtotal || 0) || 0), 0), [shopItems]);
  const [whyMap, setWhyMap] = React.useState<Record<string, string>>({});
  const [whyBusy, setWhyBusy] = React.useState<Record<string, boolean>>({});
  const [swaps, setSwaps] = React.useState<Array<{ from:string; to:string; price_from?:number; price_to?:number; price_delta?:number }>>([]);
  const [swapsOpen, setSwapsOpen] = React.useState(false);
  const [swapsPage, setSwapsPage] = React.useState(0);
  const [acceptedSwaps, setAcceptedSwaps] = React.useState<Set<string>>(new Set());
  const [cardSwapLoading, setCardSwapLoading] = React.useState<Record<string, boolean>>({});
  const [cardSwapResults, setCardSwapResults] = React.useState<Record<string, any[]>>({});
  const [batchSwapsLoading, setBatchSwapsLoading] = React.useState(false);
  
  // Name fixing for pasted deck text
  const [fixNamesOpen, setFixNamesOpen] = React.useState(false);
  const [fixNamesItems, setFixNamesItems] = React.useState<Array<{ originalName: string; qty: number; suggestions: string[] }>>([]);
  const [pendingDeckText, setPendingDeckText] = React.useState<string>("");

  // Filters and sorting
  const [priceFilter, setPriceFilter] = React.useState<{ min?: number; max?: number }>({});
  const [roleFilter, setRoleFilter] = React.useState<string>("");
  const [tierFilter, setTierFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState<"price" | "name" | "subtotal">("subtotal");
  const [sortAsc, setSortAsc] = React.useState(false);
  
  // Inline swap suggestions per card
  const [expandedSwaps, setExpandedSwaps] = React.useState<Set<string>>(new Set());
  const [bulkSelectedSwaps, setBulkSelectedSwaps] = React.useState<Set<string>>(new Set());
  
  // Collection status
  const [collectionStatus, setCollectionStatus] = React.useState<Record<string, "in_collection" | "in_wishlist" | "none">>({});
  
  // Shopping list filtering and sorting - moved to component level to fix hooks
  const filteredItems = React.useMemo(() => {
    if (shopItems.length === 0) return [];
    let filtered = [...shopItems];
    
    // Price filter
    if (priceFilter.min !== undefined) {
      filtered = filtered.filter(it => (it.price_each || 0) >= priceFilter.min!);
    }
    if (priceFilter.max !== undefined) {
      filtered = filtered.filter(it => (it.price_each || 0) <= priceFilter.max!);
    }
    
    // Role filter
    if (roleFilter) {
      filtered = filtered.filter(it => it.role === roleFilter);
    }
    
    // Tier filter
    if (tierFilter) {
      filtered = filtered.filter(it => it.tier === tierFilter);
    }
    
    // Sort
    filtered.sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortBy === "price") {
        aVal = a.price_each || 0;
        bVal = b.price_each || 0;
      } else if (sortBy === "name") {
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
      } else {
        aVal = a.subtotal || 0;
        bVal = b.subtotal || 0;
      }
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
    
    return filtered;
  }, [shopItems, priceFilter, roleFilter, tierFilter, sortBy, sortAsc]);
  
  // Get unique roles and tiers for filters
  const uniqueRoles = React.useMemo(() => Array.from(new Set(shopItems.map(it => it.role).filter(Boolean))), [shopItems]);
  const uniqueTiers = React.useMemo(() => Array.from(new Set(shopItems.map(it => it.tier).filter(Boolean))), [shopItems]);
  
  // Price trends per card (for sparklines)
  const [priceTrends, setPriceTrends] = React.useState<Record<string, Array<{ date: string; unit: number }>>>({});

  // Lazy load more shopping list items
  const loadMoreShopItems = React.useCallback(async () => {
    if (shopItemsLoading || !shopItemsHasMore) return;
    
    setShopItemsLoading(true);
    try {
      const payload: any = { 
        deckId: deckId || undefined, 
        deckText: deckText || undefined, 
        currency, 
        useOwned, 
        collectionId: useOwned ? collectionId || undefined : undefined,
        limit: 15,
        offset: shopItems.length
      };
      
      const r = await fetch("/api/deck/shopping-list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const sj = await r.json();
      
      if (r.ok && sj?.ok && Array.isArray(sj.items)) {
        setShopItems(prev => [...prev, ...sj.items]);
        setShopItemsHasMore(sj.hasMore || false);
        
        // Fetch images for new items
        const names = Array.from(new Set((sj.items as any[]).map(it => it.name))).filter(Boolean);
        if (names.length) {
          try {
            const response = await fetch('/api/cards/batch-images', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ names })
            });
            
            if (response.ok) {
              const result = await response.json();
              
              if (Array.isArray(result.data)) {
                setImgMap(prev => {
                  const updated = { ...prev };
                  result.data.forEach((card: any) => {
                    const key = card.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
                    updated[key] = {
                      small: card.image_uris?.small,
                      normal: card.image_uris?.normal
                    };
                  });
                  return updated;
                });
              }
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('[Cost to Finish] Failed to load more items:', error);
    } finally {
      setShopItemsLoading(false);
    }
  }, [shopItemsLoading, shopItemsHasMore, shopItems.length, deckId, deckText, currency, useOwned, collectionId]);

  // Set up intersection observer for lazy loading
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && shopItemsHasMore && !shopItemsLoading) {
          loadMoreShopItems();
        }
      },
      { rootMargin: '200px' }
    );

    const currentRef = shopListEndRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [loadMoreShopItems, shopItemsHasMore, shopItemsLoading]);
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

  // If collectionId parameter provided, preselect and enable owned subtraction
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
          // Fallback to API image fetch if server route fails
          if (!art && commander) {
            try {
              const response = await fetch('/api/cards/batch-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names: [commander] })
              });
              
              if (response.ok) {
                const result = await response.json();
                if (Array.isArray(result.data) && result.data[0]?.image_uris) {
                  art = result.data[0].image_uris.art_crop || result.data[0].image_uris.normal || result.data[0].image_uris.small;
                }
              }
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
    
    // If deckText is provided, check names first
    if (!deckId && String(deckText||'').trim()) {
      try {
        const r = await fetch('/api/deck/parse-and-fix-names', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckText }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.ok) {
          if (j.items && j.items.length > 0) {
            // Show modal to fix names
            setFixNamesItems(j.items);
            setPendingDeckText(deckText);
            setFixNamesOpen(true);
            return; // Don't proceed until names are fixed
          } else if (j.cards && j.cards.length > 0) {
            // All names are good, update deckText with corrected names
            const correctedText = j.cards.map((c: any) => `${c.qty} ${c.name}`).join('\n');
            setDeckText(correctedText);
          }
        }
      } catch (e: any) {
        console.error('Failed to check names:', e);
        // Continue anyway
      }
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

      // Show "taking longer than expected" toast after 8 seconds
      const slowToastTimer = setTimeout(() => {
        try {
          import('@/lib/toast-client').then(({ toast }) => {
            toast('💭 Crunching numbers... Large decks can take up to 30 seconds.', 'info');
          });
        } catch {}
      }, 8000);

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
        signal: AbortSignal.timeout(90000), // 90 second timeout
      });
      
      clearTimeout(slowToastTimer);

      const j = await res.json();
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || res.statusText);
      }
      const nextRows: ResultRow[] = j.rows ?? [];
      setRows(nextRows);
      setTotal(typeof j.total === "number" ? j.total : null);
      setPricesAt(j.prices_updated_at || null);
      
      // Log activity
      try {
        await fetch('/api/stats/activity/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'cost_computed',
            message: 'Cost to finish computed',
          }),
        });
      } catch {}

      // Fetch rarity and lightweight categories for missing cards (style + filters) - using server-side API
      try {
        const unique = Array.from(new Set(nextRows.map(r => String(r.card||'').trim()))).slice(0, 80);
        
        // Fetch metadata from server-side cache/API
        const metaResp = await fetch('/api/cards/batch-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: unique })
        });
        
        const metaData = metaResp.ok ? await metaResp.json() : { data: [] };
        console.log('[Cost to Finish] Metadata API response:', metaData);
        console.log('[Cost to Finish] First 3 data items:', metaData.data?.slice(0, 3));
        const pairs = (metaData.data || []).map((j: any) => {
          const name = j.name || '';
            const rarity = String(j?.rarity || '').toLowerCase();
            const type_line = String(j?.type_line||'');
            const oracle = String(j?.oracle_text||'');
            const land = /\bLand\b/i.test(type_line);
            const draw = /draw a card|scry [1-9]/i.test(oracle);
          const ramp = /add \{[wubrg]\}|search your library for (a|up to .*?) land|signet|talisman|sol ring/i.test(oracle + ' ' + name);
            const removal = /destroy target|exile target|counter target/i.test(oracle);
            return { name, rarity, land, ramp, draw, removal };
        });
        
        const rm: Record<string,string> = {};
        const lm: Record<string, boolean> = {};
        const cm: Record<string, { ramp?: boolean; draw?: boolean; removal?: boolean; land?: boolean }> = {};
        for (const row of pairs) {
          const key = row.name.toLowerCase();
          rm[key] = row.rarity;
          lm[key] = !!row.land;
          cm[key] = { ramp: row.ramp, draw: row.draw, removal: row.removal, land: row.land };
        }
        console.log('[Cost to Finish] Rarity map populated:', rm, 'for', pairs.length, 'cards');
        console.log('[Cost to Finish] Sample rarities:', Object.entries(rm).slice(0, 5));
        setRarityMap(rm);
        setIsLandMap(lm);
        setCatMap(cm);
      } catch (err) {
        console.error('[Cost to Finish] Failed to fetch metadata:', err);
      }

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

      // Also fetch enriched shopping list for vendor view (lazy loading - first 15 items)
      try {
        const payload: any = { 
          deckId: deckId || undefined, 
          deckText: deckText || undefined, 
          currency, 
          useOwned, 
          collectionId: useOwned ? collectionId || undefined : undefined,
          limit: 15,
          offset: 0
        };
        console.log('[Cost to Finish] Fetching shopping list with payload:', payload);
        const r = await fetch("/api/deck/shopping-list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const sj = await r.json();
        console.log('[Cost to Finish] Shopping list response:', { ok: r.ok, status: r.status, sjOk: sj?.ok, itemsCount: sj?.items?.length, total: sj?.total, hasMore: sj?.hasMore });
        if (r.ok && sj?.ok && Array.isArray(sj.items)) {
          console.log('[Cost to Finish] First 3 items:', sj.items.slice(0, 3));
          setShopItems(sj.items);
          setShopItemsHasMore(sj.hasMore || false);
          const names = Array.from(new Set((sj.items as any[]).map(it => it.name))).filter(Boolean);
          if (names.length) {
            try {
              const rr = await fetch("/api/cards/reprint-risk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cards: names.map((n:string)=>({ name:n })) }) });
              const rj = await rr.json();
              if (rr.ok && rj?.ok && rj.risks) setRiskMap(rj.risks);
            } catch {}
            try {
              const response = await fetch('/api/cards/batch-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names })
              });
              
              if (response.ok) {
                const result = await response.json();
                const obj: any = {};
                
                if (Array.isArray(result.data)) {
                  result.data.forEach((card: any) => {
                    const key = card.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
                    obj[key] = {
                      small: card.image_uris?.small,
                      normal: card.image_uris?.normal
                    };
                  });
                }
                
              setImgMap(obj);
              }
            } catch {}
          }
        } else {
          console.error('[Cost to Finish] Shopping list API failed:', sj);
        }
      } catch (e) {
        console.error('[Cost to Finish] Shopping list fetch error:', e);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
      
      // Autoscroll to results on mobile after computation
      if (typeof window !== 'undefined' && window.innerWidth < 768) { // md breakpoint
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }

  const rowsToShow = React.useMemo(() => rows.filter(r => {
    const key = String(r.card||'').toLowerCase();
    if (excludeLands && isLandMap[key]) return false;
    return true;
  }), [rows.map(r=>r.card).join('|'), excludeLands, Object.keys(isLandMap).length]);

  // Fetch price trends for cards (Pro feature)
  React.useEffect(() => {
    if (!isPro || shopItems.length === 0) return;
    
    (async () => {
      // Fetch trends for all cards in batches of 10 (API limit)
      const allNames = Array.from(new Set(shopItems.map(it => it.name).filter(Boolean)));
      const batchSize = 10;
      
      for (let i = 0; i < allNames.length; i += batchSize) {
        const batch = allNames.slice(i, i + batchSize);
        try {
          const params = new URLSearchParams();
          batch.forEach(n => params.append('names[]', n));
          params.set('currency', currency);
          const from = new Date();
          from.setDate(from.getDate() - 30);
          params.set('from', from.toISOString().slice(0, 10));
          
          const r = await fetch(`/api/price/series?${params.toString()}`);
          const j = await r.json().catch(() => ({ ok: false }));
          
          if (r.ok && j?.ok && Array.isArray(j.series)) {
            const trends: Record<string, Array<{ date: string; unit: number }>> = {};
            for (const s of j.series) {
              const cardName = s.name;
              if (s.points && Array.isArray(s.points)) {
                trends[cardName] = s.points.map((p: any) => ({ date: p.date, unit: Number(p.unit || 0) }));
              }
            }
            setPriceTrends(prev => ({ ...prev, ...trends }));
          }
        } catch {}
      }
    })();
  }, [isPro, shopItems.map(it => it.name).join('|'), currency]);
  
  // Fetch collection status for cards - check all items
  React.useEffect(() => {
    if (!user || shopItems.length === 0) return;
    
    (async () => {
      const names = Array.from(new Set(shopItems.map(it => it.name).filter(Boolean)));
      if (names.length === 0) return;
      
      try {
        const supabase = createBrowserSupabaseClient();
        
        // Check collections
        const { data: collections } = await supabase
          .from('collections')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        
        if (collections && collections.length > 0) {
          const { data: collectionCards } = await supabase
            .from('collection_cards')
            .select('name')
            .eq('collection_id', collections[0].id)
            .in('name', names);
          
          const status: Record<string, "in_collection" | "in_wishlist" | "none"> = {};
          const inCollection = new Set((collectionCards || []).map((c: any) => c.name.toLowerCase()));
          
          // Check wishlists
          const { data: wishlistItems } = await supabase
            .from('wishlist_items')
            .select('name')
            .eq('user_id', user.id)
            .in('name', names);
          
          const inWishlist = new Set((wishlistItems || []).map((w: any) => w.name.toLowerCase()));
          
          for (const name of names) {
            const key = name.toLowerCase();
            if (inCollection.has(key)) {
              status[name] = "in_collection";
            } else if (inWishlist.has(key)) {
              status[name] = "in_wishlist";
            } else {
              status[name] = "none";
            }
          }
          
          setCollectionStatus(prev => ({ ...prev, ...status }));
        }
      } catch {}
    })();
  }, [user, shopItems.map(it => it.name).join('|')]);
  
  // Fetch budget swap suggestions for a single card
  const fetchCardSwapSuggestions = async (cardName: string, currentPrice?: number) => {
    if (!isPro) {
      try {
        const { toast } = await import('@/lib/toast-client');
        toast('💎 Budget Swaps are a Pro feature - Upgrade at /pricing', 'info');
      } catch {}
      return;
    }

    const key = cardName.toLowerCase();
    setCardSwapLoading(prev => ({ ...prev, [key]: true }));
    
    try {
      const tempDeckText = `1 ${cardName}`;
      // For expensive cards, cap the budget at $20 to get truly budget-friendly alternatives
      // For cheaper cards, use 50% of the price
      const price = currentPrice || 0;
      const budgetCap = price > 40 ? 20 : Math.max(5, price * 0.5);
      const body = { deckText: tempDeckText, currency, budget: budgetCap, ai: false };
      const r = await fetch('/api/deck/swap-suggestions', { 
        method: 'POST', 
        headers: { 'content-type': 'application/json' }, 
        body: JSON.stringify(body) 
      });
      const j = await r.json().catch(() => ({}));
      
      if (!r.ok || j?.ok === false) {
        throw new Error(j?.error || 'Failed to get swap suggestions');
      }
      
      const suggestions = Array.isArray(j?.suggestions) ? j.suggestions : [];
      setCardSwapResults(prev => ({ ...prev, [key]: suggestions }));
      
      if (suggestions.length === 0) {
        try {
          const { toast } = await import('@/lib/toast-client');
          toast(`No budget alternatives found for ${cardName}`, 'info');
        } catch {}
      }
    } catch (e: any) {
      try {
        const { toastError } = await import('@/lib/toast-client');
        toastError(e?.message || 'Failed to get swap suggestions');
      } catch {
        alert(e?.message || 'Failed to get swap suggestions');
      }
    } finally {
      setCardSwapLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="mx-auto w-full max-w-[120rem] px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Enhanced header */}
      <header className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-green-900/20 via-teal-900/10 to-cyan-900/20 p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">💸</span>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
              Cost to Finish
            </h1>
          </div>
          <p className="text-base text-neutral-300 max-w-4xl leading-relaxed">
            Calculate the exact cost to complete your deck using live prices from Scryfall. Subtract cards you already own from your collection, track price trends, and discover budget-friendly alternatives.
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
            <div className="flex items-center gap-1.5 text-green-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Live Pricing</span>
            </div>
            <div className="flex items-center gap-1.5 text-teal-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span>Collection Tracking</span>
            </div>
            <div className="flex items-center gap-1.5 text-cyan-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>Budget Swaps</span>
            </div>
          </div>
          {!isPro && (
            <div className="mt-3 text-xs bg-amber-900/20 border border-amber-600/30 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="text-amber-400 text-lg">⭐</span>
              <div>
                <span className="font-semibold text-amber-300">Pro Features:</span>
                <span className="text-neutral-300 ml-1">Budget swap suggestions, Moxfield/MTGO exports, price trend sparklines, and historical snapshots.</span>
        </div>
      </div>
          )}
        </div>
      </header>

      {/* Layout: If no results, show Setup + Example side-by-side. If results, show 3-column layout */}
      <div className={`w-full ${rowsToShow.length === 0 && !busy ? 'grid md:grid-cols-[400px_1fr] gap-6 items-start' : 'space-y-6 2xl:space-y-0 2xl:grid 2xl:grid-cols-[320px_1fr_520px] 2xl:gap-6 items-start'}`}>
        {/* LEFT COLUMN: Setup */}
        <div className="space-y-3 w-full shrink-0 relative z-10">
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
          {decks.length === 0 && (
            <div className="text-xs text-yellow-400 mb-2 italic">
              Please sign in to select from your saved decks, or paste a decklist below.
            </div>
          )}
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

          {/* Collection & pricing selectors */}
          <div>
            <label className="mb-2 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useOwned}
                onChange={(e) => setUseOwned(e.target.checked)}
              />
              Subtract cards I already own
            </label>
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
            onClick={async () => {
              // Track UI click
              track('ui_click', {
                area: 'functions',
                action: 'run',
                fn: 'cost-to-finish',
              }, {
                userId: user?.id || null,
                isPro: isPro,
              });
              await onCompute();
            }}
            disabled={busy}
            className={`w-full rounded-md px-4 py-2 ${busy ? "bg-sky-300/60" : "bg-sky-500 hover:bg-sky-400"} text-black font-semibold`}
          >
            {busy ? "Computing…" : "Compute cost"}
          </button>
        </div>

        {/* Example Result - show when no results, in its own column next to setup */}
        {rowsToShow.length === 0 && !busy && (
          <div className="w-full min-w-0 rounded-xl border border-blue-500/40 bg-blue-950/20 p-6">
            <div className="text-base font-semibold mb-3 text-blue-300 flex items-center gap-2">
              <span>👁️</span>
              <span>Example Result Preview</span>
            </div>
            <div className="text-sm text-neutral-300 mb-4">
              Here's what a Cost to Finish analysis looks like for a sample Atraxa deck. Paste your own deck in the panel to the left to see real results!
            </div>
            
            {/* Example screenshot */}
            <img 
              src="/screenshot-cost-to-finish-example.png" 
              alt="Example Cost to Finish analysis showing total cost, deck completion, top missing cards, and shopping list" 
              className="w-full rounded-lg border border-neutral-700 shadow-lg cursor-pointer hover:border-blue-500/60 transition-colors"
              onClick={async()=>{ try{ const { toast } = await import('@/lib/toast-client'); toast('Paste your deck to see real results','info'); } catch { alert('Paste your deck to see real results'); } }}
            />
          </div>
        )}

        {/* MIDDLE COLUMN: Summary + Full Shopping List - only show when there are results */}
        {rowsToShow.length > 0 && (
        <div ref={resultsRef} className="flex-1 min-w-0 w-full space-y-3 relative z-20">
          {/* Summary card */}
          {rowsToShow.length>0 && (
            <div className="w-full max-w-none min-w-0 rounded-xl border border-emerald-700/60 bg-neutral-950 p-4 sm:p-5 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-bold">💰 Total Cost to Finish</div>
              </div>
              {(() => {
                const missing = rowsToShow.reduce((s, r)=> s + Number(r.need||0), 0);
                const biggest = rowsToShow.slice().sort((a,b)=>(b.unit||0)-(a.unit||0))[0];
                const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$');
                const computedTotal = rowsToShow.reduce((s, r)=> s + (Number(r.unit||0)*Number(r.need||0)), 0);
                
                // Deck completion calculation (assume 100-card Commander deck)
                const deckSize = 100;
                const owned = deckSize - missing;
                const completionPercent = Math.round((owned / deckSize) * 100);
                
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
                  <>
                    {/* Main cost display */}
                    <div className="mb-6 text-center">
                      <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-sky-400 mb-2">
                        {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(computedTotal)}
                    </div>
                      <div className="text-sm text-neutral-400">Based on live market prices from Scryfall</div>
                    </div>
                    
                    {/* Progress bar for deck completion */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <div className="font-medium">🧩 Deck Completion</div>
                        <div className="text-neutral-400">{owned}/{deckSize} cards ({completionPercent}%)</div>
                    </div>
                      <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 rounded-full transition-all duration-500"
                          style={{ width: `${completionPercent}%` }}
                        />
                    </div>
                    </div>
                    
                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-center">
                      <div className="opacity-70 text-sm mb-1">💾 Cards Owned</div>
                      <div className="text-2xl font-bold text-emerald-400">{owned}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-center">
                      <div className="opacity-70 text-sm mb-1">❌ Missing</div>
                      <div className="text-2xl font-bold text-amber-400">{missing}</div>
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-center">
                      <div className="opacity-70 text-sm mb-1">💸 Biggest</div>
                      <div className="text-lg font-bold truncate">{sym}{(biggest?.unit||0).toFixed(0)}</div>
                      <div className="text-xs opacity-70 truncate">{biggest?.card || '—'}</div>
                    </div>
                  </div>
                    
                    {/* Category breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        ['🏞️ Lands', cats.land],
                        ['⚡ Ramp', cats.ramp],
                        ['📜 Draw', cats.draw],
                        ['💥 Removal', cats.removal],
                      ].map(([label, val]) => (
                        <div key={String(label)} className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-2 flex flex-col items-center justify-center text-center">
                          <div className="opacity-80 text-sm font-medium mb-1">{label}</div>
                          <div className="text-lg font-semibold">{val as number}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Distribution charts */}
          <div className="w-full max-w-none min-w-0"><DistributionCharts /></div>

          {/* Export for vendor list (shopping) */}
          {shopItems.length > 0 && (
            <div className="w-full rounded-lg border border-neutral-800 bg-neutral-900/30 p-4 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      // Show toast notification
                      try {
                        const { toast } = await import('@/lib/toast-client');
                        toast('🔄 Fetching full shopping list with latest prices...', 'info');
                      } catch {}
                      
                      // Fetch FULL list for export (no limit)
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
                      
                      // Success toast
                      try {
                        const { toast } = await import('@/lib/toast-client');
                        toast(`✅ Exported ${items.length} cards to CSV!`, 'success');
                      } catch {}
                    } catch (e: any) {
                      try {
                        const { toastError } = await import('@/lib/toast-client');
                        toastError(e?.message || 'Export failed');
                      } catch {
                      alert(e?.message || 'Export failed');
                      }
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors"
                >
                  📥 Export Shopping CSV
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
                  className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-colors">
                  📥 Export Missing CSV
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
                  className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors">
                  ➕ Add missing → Wishlist
                </button>
                <a
                  href="/profile?tab=wishlist"
                  className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-white font-medium text-sm transition-colors">
                  👁️ View Wishlist →
                </a>
                <div className="w-px h-8 bg-neutral-700"></div>
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
                  className="px-3 py-2 rounded-lg border border-amber-600 hover:bg-amber-600/10 text-white font-medium text-sm inline-flex items-center gap-2 transition-colors">
                  Export → Moxfield <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold uppercase">Pro</span>
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
                  className="px-3 py-2 rounded-lg border border-amber-600 hover:bg-amber-600/10 text-white font-medium text-sm inline-flex items-center gap-2 transition-colors">
                  Export → MTGO <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold uppercase">Pro</span>
                </button>
                <button
                  onClick={async () => {
                    if (!isPro) { try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature.'); } return; }
                    setBatchSwapsLoading(true);
                    try{
                      // Don't set a budget threshold - find ALL possible swaps
                      const body:any = { deckText, currency, useSnapshot, snapshotDate, ai: false };
                      console.log('[Budget Swaps] Requesting swaps with payload:', body);
                      const r = await fetch('/api/deck/swap-suggestions', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
                      const j = await r.json().catch(()=>({}));
                      console.log('[Budget Swaps] API response:', { ok: r.ok, status: r.status, responseOk: j?.ok, suggestionsCount: j?.suggestions?.length });
                      console.log('[Budget Swaps] Full response:', j);
                      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Swap suggestions failed');
                      const sugs = Array.isArray(j?.suggestions)? j.suggestions: [];
                      console.log('[Budget Swaps] Parsed suggestions:', sugs);
                      setSwaps(sugs); 
                      setSwapsPage(0); 
                      setAcceptedSwaps(new Set());
                      setSwapsOpen(true);
                    } catch(e:any){ 
                      console.error('[Budget Swaps] Error:', e);
                      try {
                        const { toastError } = await import('@/lib/toast-client');
                        toastError(e?.message || 'Suggestions failed');
                      } catch {
                        alert(e?.message||'Suggestions failed');
                      }
                    } finally {
                      setBatchSwapsLoading(false);
                    }
                  }}
                  disabled={batchSwapsLoading}
                  className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm inline-flex items-center gap-2 transition-colors">
                  {batchSwapsLoading ? '🔄 Loading...' : '💡 Suggest budget swaps'}{' '}
                  {!batchSwapsLoading && (
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold uppercase">Pro</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Enriched shopping list view */}
          {shopItems.length > 0 && (
            <div className="mt-2 w-full max-w-none min-w-0">
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-bold">🛒 Shopping list ({filteredItems.length} of {shopItems.length})</div>
              </div>
              
              {/* Filters and sorting */}
              <div className="mb-3 p-3 rounded-lg border border-neutral-800 bg-neutral-900/50 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 font-medium">Price:</span>
                  <input
                    type="number"
                    placeholder="Min"
                    value={priceFilter.min || ""}
                    onChange={(e) => setPriceFilter(p => ({ ...p, min: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-20 px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-neutral-500">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={priceFilter.max || ""}
                    onChange={(e) => setPriceFilter(p => ({ ...p, max: e.target.value ? Number(e.target.value) : undefined }))}
                    className="w-20 px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">All Roles</option>
                  {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value)}
                  className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">All Tiers</option>
                  {uniqueTiers.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="subtotal">Sort by Subtotal</option>
                  <option value="price">Sort by Price</option>
                  <option value="name">Sort by Name</option>
                </select>
                
                <button
                  onClick={() => setSortAsc(!sortAsc)}
                  className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-700 transition-colors"
                  title={sortAsc ? "Ascending" : "Descending"}
                >
                  {sortAsc ? "↑" : "↓"}
                </button>
                
                {isPro && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={expandedSwaps.size > 0}
                      onChange={(e) => {
                        if (!e.target.checked) {
                          setExpandedSwaps(new Set());
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-neutral-400">Show swaps only</span>
                  </label>
                )}
                
                {(priceFilter.min !== undefined || priceFilter.max !== undefined || roleFilter || tierFilter) && (
                  <button
                    onClick={() => {
                      setPriceFilter({});
                      setRoleFilter("");
                      setTierFilter("");
                    }}
                    className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded text-white transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
              
              {/* Bulk swap actions */}
              {isPro && bulkSelectedSwaps.size > 0 && (
                <div className="mb-3 p-3 rounded-lg border border-emerald-600 bg-emerald-950/20 flex items-center justify-between">
                  <div className="text-sm text-emerald-400">
                    {bulkSelectedSwaps.size} swap{bulkSelectedSwaps.size !== 1 ? 's' : ''} selected
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Apply all selected swaps
                        const swapsToApply = swaps.filter(s => bulkSelectedSwaps.has(s.from));
                        setShopItems(prev => {
                          let updated = [...prev];
                          for (const swap of swapsToApply) {
                            updated = updated.map(item => 
                              item.name.toLowerCase() === swap.from.toLowerCase()
                                ? { ...item, name: swap.to, price_each: swap.price_to, subtotal: (swap.price_to || 0) * (item.qty_to_buy || 1) }
                                : item
                            );
                          }
                          return updated;
                        });
                        setAcceptedSwaps(prev => new Set([...prev, ...Array.from(bulkSelectedSwaps)]));
                        setBulkSelectedSwaps(new Set());
                        try {
                          import('@/lib/toast-client').then(({ toast }) => 
                            toast(`✓ Applied ${swapsToApply.length} swap${swapsToApply.length !== 1 ? 's' : ''}`, 'success')
                          );
                        } catch {}
                      }}
                      className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded text-white font-medium"
                    >
                      Apply Selected ({bulkSelectedSwaps.size})
                    </button>
                    <button
                      onClick={() => setBulkSelectedSwaps(new Set())}
                      className="px-3 py-1.5 text-xs bg-neutral-700 hover:bg-neutral-600 rounded text-white"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
              {/* Fixed height container with internal scroll */}
              <div className="w-full max-w-none min-w-0 rounded-xl border max-h-[600px] overflow-y-auto">
                <div className="relative w-full min-w-0 px-2 sm:px-3 lg:px-4">
                  <table className="w-full table-auto text-sm">
                    <thead className="bg-black/30 sticky top-0 z-10">
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 w-[42px] align-middle"></th>
                        <th className="text-left py-2 px-3 align-middle whitespace-normal break-words">Card</th>
                        <th className="text-left py-2 px-3 align-middle whitespace-normal break-words">Cheapest print</th>
                        <th className="text-right py-2 px-3 align-middle whitespace-normal break-words">Qty</th>
                        <th className="text-right py-2 px-3 align-middle whitespace-normal break-words">Unit</th>
                        {isPro && <th className="text-center py-2 px-3 align-middle whitespace-normal break-words w-[80px]">Trend</th>}
                        <th className="text-right py-2 px-3 align-middle whitespace-normal break-words">Subtotal</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Source</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Role</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Tier</th>
                        <th className="hidden 2xl:table-cell text-left py-2 px-3 align-middle whitespace-normal break-words">Link</th>
                        <th className="text-left py-2 px-3 align-middle whitespace-normal break-words">Actions</th>
                      </tr>
                    </thead>
                    <tbody>

                  {filteredItems.map((it, i) => {
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
                            <td className="py-1 px-3 align-middle whitespace-normal break-words">
                              {it.set && it.collector_number ? `${it.set?.toUpperCase()} #${it.collector_number}` : <span className="text-neutral-600 italic text-xs">Loading...</span>}
                            </td>
                            <td className="py-1 px-3 text-right align-middle whitespace-normal break-words">{it.qty_to_buy || 0}</td>
                            <td className="py-1 px-3 text-right align-middle whitespace-normal break-words">
                              {it.price_each != null && it.price_each > 0 ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(it.price_each) : <span className="text-neutral-600 italic text-xs">Loading...</span>}
                            </td>
                            {isPro && (
                              <td className="py-1 px-3 text-center align-middle">
                                {(() => {
                                  const trend = priceTrends[name.toLowerCase()] || priceTrends[name];
                                  if (!trend || trend.length < 2) {
                                    // Show loading indicator if we're still fetching
                                    const isFetching = shopItems.some(item => item.name === name);
                                    return isFetching ? (
                                      <span className="text-xs text-neutral-600 animate-pulse">⋯</span>
                                    ) : (
                                      <span className="text-xs text-neutral-600" title="No trend data available">—</span>
                                    );
                                  }
                                  const w = 70, h = 24;
                                  const vals = trend.map(p => p.unit);
                                  const min = Math.min(...vals), max = Math.max(...vals);
                                  const nx = (i: number) => i * (w / Math.max(1, trend.length - 1));
                                  const ny = (v: number) => max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
                                  const path = trend.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${nx(idx)},${ny(p.unit)}`).join(' ');
                                  const isRising = vals[vals.length - 1] > vals[0];
                                  const changePct = ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100;
                                  const changeAbs = Math.abs(changePct);
                                  const tooltip = `${isRising ? '+' : ''}${changePct.toFixed(1)}% over ${trend.length} days`;
                                  const color = changeAbs > 10 ? (isRising ? "#ef4444" : "#10b981") : "#6b7280";
                                  return (
                                    <div className="inline-block group relative cursor-help" title={tooltip}>
                                      <svg width={w} height={h} className="inline-block">
                                        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        {/* Area fill with gradient */}
                                        <defs>
                                          <linearGradient id={`grad-${name.replace(/\s+/g, '-')}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                                            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
                                          </linearGradient>
                                        </defs>
                                        <path d={`${path} L ${w},${h} L 0,${h} Z`} fill={`url(#grad-${name.replace(/\s+/g, '-')})`} />
                                        {/* Current price dot */}
                                        <circle cx={nx(trend.length - 1)} cy={ny(vals[vals.length - 1])} r="2.5" fill={color} />
                                      </svg>
                                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-xs text-neutral-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                        <div className="font-semibold mb-0.5">{name}</div>
                                        <div>{tooltip}</div>
                                        <div className="text-neutral-400 mt-0.5">Current: {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(vals[vals.length - 1])}</div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </td>
                            )}
                            <td className="py-1 px-3 text-right align-middle whitespace-normal break-words">
                              {it.subtotal != null && it.subtotal > 0 ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(it.subtotal) : <span className="text-neutral-600 italic text-xs">Loading...</span>}
                            </td>
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
                            <td className="py-1 px-3 align-middle whitespace-normal break-words">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Collection status */}
                                {(() => {
                                  const status = collectionStatus[name];
                                  if (status === "in_collection") {
                                    return (
                                      <span 
                                        className="text-xs px-2 py-1 rounded bg-green-900/50 text-green-400 border border-green-800 font-medium cursor-help" 
                                        title="This card is in your collection"
                                      >
                                        ✓ Owned
                                      </span>
                                    );
                                  } else if (status === "in_wishlist") {
                                    return (
                                      <span 
                                        className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-400 border border-blue-800 font-medium cursor-help" 
                                        title="This card is in your wishlist"
                                      >
                                        ★ Wishlist
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                
                                {/* Budget swaps button */}
                                {isPro && (() => {
                                  const cardSwaps = cardSwapResults[name] || [];
                                  const hasSwaps = cardSwaps.length > 0;
                                  return (
                                    <button
                                      className="text-xs px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30"
                                      onClick={() => {
                                        if (expandedSwaps.has(name)) {
                                          setExpandedSwaps(prev => {
                                            const next = new Set(prev);
                                            next.delete(name);
                                            return next;
                                          });
                                        } else {
                                          setExpandedSwaps(prev => new Set(prev).add(name));
                                          if (!hasSwaps && !cardSwapLoading[name]) {
                                            fetchCardSwapSuggestions(name);
                                          }
                                        }
                                      }}
                                    >
                                      {hasSwaps ? `💡 ${cardSwaps.length}` : '💡 Swap'}
                                    </button>
                                  );
                                })()}
                                
                                {/* Why button */}
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
                              </div>
                            </td>
                          </tr>
                          {/* Expanded swap suggestions */}
                          {isPro && expandedSwaps.has(name) && (() => {
                            const cardSwaps = cardSwapResults[name] || [];
                            const loading = cardSwapLoading[name];
                            return (
                              <tr className="border-b bg-emerald-950/10">
                                <td colSpan={isPro ? 12 : 11} className="py-3 px-4">
                                  {loading ? (
                                    <div className="text-xs text-neutral-400">Loading swap suggestions...</div>
                                  ) : cardSwaps.length === 0 ? (
                                    <div className="text-xs text-neutral-400">No budget alternatives found for this card.</div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="text-xs font-semibold text-emerald-400 mb-2">Budget Alternatives:</div>
                                      {cardSwaps.map((swap: any, idx: number) => {
                                        const savings = (it.price_each || 0) - (swap.price_to || swap.price || 0);
                                        const isSelected = bulkSelectedSwaps.has(swap.from || name);
                                        const isAccepted = acceptedSwaps.has(swap.from || name);
                                        const swapKey = String(swap.to || swap.name || '').toLowerCase();
                                        const swapImg = imgMap[swapKey]?.small;
                                        return (
                                          <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${isAccepted ? 'border-emerald-500 bg-emerald-950/30' : 'border-neutral-700 bg-neutral-900/50 hover:border-emerald-600/50'}`}>
                                            {/* Swap card image */}
                                            {swapImg && (
                                              <img
                                                src={swapImg}
                                                alt={swap.to || swap.name}
                                                loading="lazy"
                                                className="w-12 h-16 object-cover rounded border border-neutral-700 shrink-0"
                                                onMouseEnter={(e) => {
                                                  const normalImg = imgMap[swapKey]?.normal || swapImg;
                                                  setPv({ src: normalImg, x: (e as any).clientX, y: (e as any).clientY - 16, shown: true });
                                                }}
                                                onMouseMove={(e) => setPv(p => p.shown ? { ...p, x: (e as any).clientX, y: (e as any).clientY - 16 } : p)}
                                                onMouseLeave={() => setPv(p => ({ ...p, shown: false }))}
                                              />
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 text-sm mb-1">
                                                <span className="font-medium text-neutral-300 line-through">{name}</span>
                                                <span className="text-neutral-500">→</span>
                                                <span className="font-semibold text-emerald-400">{swap.to || swap.name}</span>
                                              </div>
                                              {swap.reason && (
                                                <div className="text-xs text-neutral-400 mb-2 italic line-clamp-2">
                                                  {swap.reason}
                                                </div>
                                              )}
                                              <div className="flex items-center gap-3 text-xs">
                                                <span className="line-through text-neutral-500">{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(it.price_each || 0)}</span>
                                                <span className="text-emerald-400 font-semibold">{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(swap.price_to || swap.price || 0)}</span>
                                                <span className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-semibold">
                                                  Save {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(savings)}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {isPro && (
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={(e) => {
                                                    if (e.target.checked) {
                                                      setBulkSelectedSwaps(prev => new Set(prev).add(swap.from || name));
                                                    } else {
                                                      setBulkSelectedSwaps(prev => {
                                                        const next = new Set(prev);
                                                        next.delete(swap.from || name);
                                                        return next;
                                                      });
                                                    }
                                                  }}
                                                  className="w-4 h-4 cursor-pointer"
                                                  title="Select for bulk apply"
                                                />
                                              )}
                                              <button
                                                onClick={() => {
                                                  if (isAccepted) {
                                                    setAcceptedSwaps(prev => {
                                                      const next = new Set(prev);
                                                      next.delete(swap.from || name);
                                                      return next;
                                                    });
                                                  } else {
                                                    setAcceptedSwaps(prev => new Set(prev).add(swap.from || name));
                                                    setShopItems(prev => prev.map(item => 
                                                      item.name.toLowerCase() === name.toLowerCase()
                                                        ? { ...item, name: swap.to || swap.name, price_each: swap.price_to || swap.price, subtotal: (swap.price_to || swap.price || 0) * (item.qty_to_buy || 1) }
                                                        : item
                                                    ));
                                                    try {
                                                      import('@/lib/toast-client').then(({ toast }) => 
                                                        toast(`✓ Swapped ${name} → ${swap.to || swap.name}`, 'success')
                                                      );
                                                    } catch {}
                                                  }
                                                }}
                                                className={`px-3 py-1.5 rounded font-medium text-xs transition-colors ${
                                                  isAccepted 
                                                    ? 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300' 
                                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-lg'
                                                }`}
                                              >
                                                {isAccepted ? '✓ Applied' : 'Apply'}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })()}
                          
                          {whyMap[name] && (
                            <tr className="border-b bg-blue-950/20">
                              <td colSpan={isPro ? 12 : 11} className="py-3 px-4 text-sm text-neutral-200 leading-relaxed">
                                <div className="flex items-start gap-2">
                                  <span className="text-blue-400 font-semibold shrink-0">💡</span>
                                  <span>{whyMap[name]}</span>
                                </div>
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
                    {isPro && <td />}
                    <td className="py-2 px-3 text-left">
                      {useSnapshot ? (
                        <span className="inline-flex items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-neutral-800 text-xs">Snapshot</span>{yesterdayDelta!=null && (<span className={`text-xs ${yesterdayDelta>=0?'text-red-300':'text-emerald-300'}`}>{yesterdayDelta>=0?'+':''}{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(yesterdayDelta)}</span>)}</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-neutral-900 text-xs">Live</span>
                      )}
                    </td>
                    <td colSpan={isPro ? 4 : 3} />
                  </tr>
                </tfoot>
              </table>
              
              {/* Lazy loading indicator and trigger */}
              <div ref={shopListEndRef} className="py-4 flex items-center justify-center">
                {shopItemsLoading && (
                  <div className="text-xs text-blue-400 animate-pulse flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading more cards...
              </div>
                )}
                {!shopItemsLoading && !shopItemsHasMore && shopItems.length > 0 && (
                  <div className="text-xs text-neutral-500">
                    ✓ All cards loaded ({shopItems.length} total)
                  </div>
                )}
              </div>
            </div>
          </div>
            </div>
          )}

        {/* Swaps modal (Pro) - Interactive with pagination - MODAL OVERLAY */}
        {swapsOpen && (
        <>
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={() => setSwapsOpen(false)}
          />
          
          {/* Modal panel */}
          <div className="fixed inset-4 md:inset-8 lg:inset-16 z-[101] overflow-auto">
            <div className="max-w-4xl mx-auto rounded-xl border border-emerald-700/40 bg-neutral-950 shadow-2xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="text-lg font-bold text-emerald-400">💰 Budget Swap Suggestions</div>
                <button 
                  className="text-sm px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 transition-colors" 
                  onClick={()=>setSwapsOpen(false)}
                >
                  Close
                </button>
            </div>
              
              {swaps.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">✅</div>
                  <div className="text-lg font-semibold mb-2">No Cheaper Options Available</div>
                  <div className="text-sm text-neutral-400">Your deck is already using budget-friendly versions of these cards!</div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-neutral-300 mb-3">
                    Found <span className="font-bold text-emerald-400">{swaps.length}</span> potential swaps to save money
                  </div>
                  
                  {/* Paginated swap cards */}
                  <div className="space-y-2 mb-4">
                    {swaps.slice(swapsPage * 10, (swapsPage + 1) * 10).map((s, i)=> {
                      const globalIdx = swapsPage * 10 + i;
                      const isAccepted = acceptedSwaps.has(s.from);
                      const savings = (s.price_from || 0) - (s.price_to || 0);
                      
                      return (
                        <div key={`sw-${globalIdx}`} className={`rounded-lg border p-3 transition-all ${isAccepted ? 'border-emerald-500 bg-emerald-950/30' : 'border-neutral-700 bg-neutral-900/50'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-mono text-sm font-semibold">{s.from}</span>
                                <span className="text-neutral-500">→</span>
                                <span className="font-mono text-sm font-semibold text-emerald-400">{s.to}</span>
          </div>
                              <div className="flex items-center gap-3 text-xs text-neutral-400">
                                <span className="line-through">{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(s.price_from || 0)}</span>
                                <span className="text-emerald-400 font-semibold">{new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(s.price_to || 0)}</span>
                                <span className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-semibold">
                                  Save {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(savings)}
                                </span>
                              </div>
        </div>
        
                            <button
                                onClick={() => {
                                  if (isAccepted) {
                                    setAcceptedSwaps(prev => {
                                      const next = new Set(prev);
                                      next.delete(s.from);
                                      return next;
                                    });
                                  } else {
                                    setAcceptedSwaps(prev => new Set(prev).add(s.from));
                                    // Update shopping list in place
                                    setShopItems(prev => prev.map(item => 
                                      item.name.toLowerCase() === s.from.toLowerCase() 
                                        ? { ...item, name: s.to, price_each: s.price_to, subtotal: (s.price_to || 0) * (item.qty_to_buy || 1) }
                                        : item
                                    ));
                                    try {
                                      import('@/lib/toast-client').then(({ toast }) => 
                                        toast(`✓ Swapped ${s.from} → ${s.to}`, 'success')
                                      );
                                    } catch {}
                                  }
                                }}
                                className={`px-3 py-1.5 rounded font-medium text-sm transition-colors shrink-0 ${
                                  isAccepted 
                                    ? 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300' 
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                }`}
                              >
                                {isAccepted ? '✓ Accepted' : 'Accept'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Pagination controls */}
                    {swaps.length > 10 && (
                      <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
                        <div className="text-xs text-neutral-400">
                          Showing {swapsPage * 10 + 1}–{Math.min((swapsPage + 1) * 10, swaps.length)} of {swaps.length}
                        </div>
                        <div className="flex items-center gap-2">
                          {swapsPage > 0 && (
                            <button
                              onClick={() => setSwapsPage(p => p - 1)}
                              className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                            >
                              ← Previous
                            </button>
                          )}
                          {(swapsPage + 1) * 10 < swaps.length && (
                            <button
                              onClick={() => setSwapsPage(p => p + 1)}
                              className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-sm font-medium transition-colors"
                            >
                              Show me more →
                            </button>
                          )}
                </div>
                </div>
                    )}
                  </>
                )}
                </div>
              </div>
          </>
        )}
        </div>
        )}

        {/* RIGHT COLUMN: Top Missing Cards - only show when there are results */}
        {rowsToShow.length > 0 && (
        <div className="w-full 2xl:w-[520px] shrink-0 space-y-3 relative z-10">
          {/* Top Missing Cards */}
          {rowsToShow.length > 0 && (() => {
            const topCards = rowsToShow.slice().sort((a, b) => (b.unit || 0) - (a.unit || 0)).slice(0, 5);
            const capitalize = (str: string) => str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
            
            return (
              <div className="rounded-xl border border-red-700/40 bg-neutral-950 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🔥</span>
                  <div className="text-base font-bold">Top Missing Cards</div>
            </div>
                <div className="space-y-2">
                  {topCards.map((r, i) => {
                    const key = String(r.card || '').toLowerCase();
                    const imgData = imgMapRows[key];
                    const loading = cardSwapLoading[key];
                    const swaps = cardSwapResults[key] || [];
                    const cardNameDisplay = capitalize(String(r.card || ''));
                    const uri = `https://scryfall.com/search?q=${encodeURIComponent(r.card)}`;
                    
                    return (
                      <div key={`${r.card}-${i}`} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                        <div className="flex items-start gap-3">
                          {/* Card thumbnail - always show with fallback */}
                          <div 
                            className="w-10 h-14 shrink-0 rounded cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all overflow-hidden bg-neutral-800 flex items-center justify-center"
                            onMouseEnter={(e) => {
                              if (imgData?.normal || imgData?.small) {
                                setPv({
                                  src: imgData.normal || imgData.small || '',
                                  x: (e as any).clientX,
                                  y: (e as any).clientY - 16,
                                  shown: true,
                                  price: r.unit,
                                  cardName: cardNameDisplay,
                                  scryfallUri: uri
                                });
                              }
                            }}
                            onMouseMove={(e) => setPv(p => p.shown ? { ...p, x: (e as any).clientX, y: (e as any).clientY - 16 } : p)}
                            onMouseLeave={() => setPv(p => ({ ...p, shown: false }))}
                          >
                            {imgData?.small ? (
                              <img
                                src={imgData.small}
                                alt={cardNameDisplay}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-[10px] text-neutral-600 text-center px-1">🃏</div>
                            )}
                </div>
                          
                          {/* Card info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{cardNameDisplay}</div>
                            <div className="text-xs text-emerald-400 font-mono">
                              {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(r.unit)}
                              {r.need > 1 && ` × ${r.need}`}
                </div>
                            
                            {/* Budget swap button */}
                            <button
                              onClick={() => fetchCardSwapSuggestions(r.card, r.unit)}
                              disabled={loading}
                              className="mt-2 text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {loading ? 'Finding...' : 'Find budget alternative'}
                            </button>
                            
                            {/* Swap results - clickable */}
                            {swaps.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {swaps.slice(0, 3).map((swap: any, si: number) => (
                                  <div 
                                    key={si} 
                                    className="text-xs bg-neutral-800 hover:bg-neutral-700 rounded px-2 py-1 cursor-pointer transition-colors"
                                    onClick={async () => {
                                      const fromCard = capitalize(String(r.card || ''));
                                      const toCard = capitalize(swap.to || swap.name || '');
                                      const savings = (swap.price_from || r.unit) - (swap.price_to || swap.price || 0);
                                      
                                      const panelId = showToastPanel({
                                        title: '💱 Apply Budget Swap?',
                                        lines: [
                                          { text: `Replace ${fromCard} (${new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(r.unit)})` },
                                          { text: `with ${toCard} (${new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(swap.price_to || swap.price || 0)})?` },
                                          { text: `Savings: ${new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(savings)}` }
                                        ],
                                        actions: [
                                          {
                                            id: 'apply',
                                            label: 'Apply Swap',
                                            variant: 'primary',
                                            onClick: async () => {
                                              // Close the modal immediately
                                              removeToast(panelId.id);
                                              
                                              // Update the shopping list by replacing the original card with the budget alternative
                                              setRows(prev => prev.map(row => 
                                                String(row.card || '').toLowerCase() === String(r.card || '').toLowerCase()
                                                  ? { ...row, card: toCard, unit: swap.price_to || swap.price || 0 }
                                                  : row
                                              ));
                                              
                                              try {
                                                const { toast } = await import('@/lib/toast-client');
                                                toast(`✅ Swapped ${fromCard} → ${toCard}`, 'success');
                                              } catch {}
                                            }
                                          },
                                          { id: 'cancel', label: 'Cancel' }
                                        ],
                                        autoCloseMs: null
                                      });
                                    }}
                                  >
                                    <div className="font-medium">{capitalize(swap.to || swap.name || '')}</div>
                                    <div className="text-emerald-400">
                                      {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(swap.price_to || swap.price || 0)}
                                      {' '}
                                      <span className="text-neutral-400">
                                        (save {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((swap.price_from || r.unit) - (swap.price_to || swap.price || 0))})
                                      </span>
                </div>
                </div>
                                ))}
              </div>
                            )}
            </div>
          </div>
        </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
        )}
      </div>

      {/* Global hover preview for card images */}
      {pv.shown && typeof window !== 'undefined' && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: pv.x, top: pv.y, transform: 'translate(-50%, -100%)' }}>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
            <img src={pv.src} alt="preview" className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded-t" />
            {(pv.price !== undefined || pv.scryfallUri) && (
              <div className="p-2 border-t border-neutral-700 flex items-center justify-between gap-2">
                {pv.price !== undefined && (
                  <div className="text-sm font-semibold text-emerald-400">
                    {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(pv.price)}
                  </div>
                )}
                {pv.scryfallUri && (
                  <a 
                    href={pv.scryfallUri} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 underline pointer-events-auto"
                  >
                    See on Scryfall →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      <FixDeckNamesModal
        open={fixNamesOpen}
        onClose={() => setFixNamesOpen(false)}
        items={fixNamesItems}
        onApply={(choices) => {
          // Update deckText with corrected names
          const r = fetch('/api/deck/parse-and-fix-names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deckText: pendingDeckText }),
          }).then(res => res.json()).then(j => {
            if (j?.ok && j.cards) {
              // Apply user choices
              const corrected = j.cards.map((c: any) => {
                const choice = choices[c.name];
                return { ...c, name: choice || c.name };
              });
              const correctedText = corrected.map((c: any) => `${c.qty} ${c.name}`).join('\n');
              setDeckText(correctedText);
              // Re-run compute with corrected text
              setTimeout(() => onCompute(), 100);
            }
          }).catch(() => {});
        }}
      />
    </div>
  );
}
