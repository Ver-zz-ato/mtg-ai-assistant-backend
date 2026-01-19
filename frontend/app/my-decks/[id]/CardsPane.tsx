// app/my-decks/[id]/CardsPane.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { capture } from '@/lib/ph';
import EditorAddBar from "@/components/EditorAddBar";
import FixSingleCardModal from "./FixSingleCardModal";

type CardRow = { id: string; deck_id: string; name: string; qty: number; created_at: string };

export default function CardsPane({ deckId, format, allowedColors = [] }: { deckId?: string; format?: string; allowedColors?: string[] }) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fixModalCard, setFixModalCard] = useState<{ id: string; name: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteStatus, setPasteStatus] = useState<string | null>(null);
  const [showAddValidation, setShowAddValidation] = useState(false);
  const [addValidationItems, setAddValidationItems] = useState<Array<{ originalName: string; suggestions: string[]; choice?: string; qty: number }>>([]);
  const [pendingAddName, setPendingAddName] = useState<string>('');
  const [pendingAddQty, setPendingAddQty] = useState<number>(1);
  const addBarRef = React.useRef<HTMLDivElement|null>(null);
  const listRef = React.useRef<HTMLDivElement|null>(null);

  async function load() {
    if (!deckId) return;
    const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { cache: "no-store" });
    let json: any = {};
    try { json = await res.json(); } catch { json = { ok: false, error: "Bad JSON" }; }
    if (!json?.ok) { setStatus(json?.error || `Error ${res.status}`); return; }
    setCards(json.cards || []);
    setStatus(null);
  }

  useEffect(() => { 
    load(); 
    
    // Listen for deck changes from other components (AI suggestions, etc.)
    const handleDeckChange = () => load();
    window.addEventListener('deck:changed', handleDeckChange);
    return () => window.removeEventListener('deck:changed', handleDeckChange);
  }, [deckId]);

  async function add(name: string | { name: string }, qty: number, validatedName?: string) {
    if (!deckId) return;
    const n = (validatedName || (typeof name === "string" ? name : name?.name) || '').trim();
    const q = Math.max(1, Number(qty) || 1);
    if (!n) return;
    try { const { containsProfanity } = await import("@/lib/profanity"); if (containsProfanity(n)) { alert('Please choose a different name.'); return; } } catch {}

    // If validatedName is provided, skip validation (already validated)
    if (!validatedName) {
      // Validate card name before adding
      try {
        const validationRes = await fetch('/api/cards/fuzzy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: [n] })
        });
        const validationJson = await validationRes.json().catch(() => ({}));
        const fuzzyResults = validationJson?.results || {};
        
        const suggestion = fuzzyResults[n]?.suggestion;
        const allSuggestions = Array.isArray(fuzzyResults[n]?.all) ? fuzzyResults[n].all : [];
        
        // If name needs fixing, show validation modal
        if (suggestion && suggestion !== n && allSuggestions.length > 0) {
          setAddValidationItems([{
            originalName: n,
            suggestions: allSuggestions,
            choice: allSuggestions[0] || suggestion,
            qty: q
          }]);
          setPendingAddName(n);
          setPendingAddQty(q);
          setShowAddValidation(true);
          return;
        }
      } catch (validationError) {
        console.warn('Validation check failed, proceeding anyway:', validationError);
        // Continue with adding if validation fails (fallback)
      }
    }

    // For Commander format: validate color identity matches commander
    if (format?.toLowerCase() === 'commander' && allowedColors.length > 0) {
      try {
        const cardName = validatedName || n;
        // Fetch card color_identity from Scryfall cache
        const colorCheckRes = await fetch(`/api/cards/color-check?name=${encodeURIComponent(cardName)}&allowedColors=${allowedColors.join(',')}`);
        const colorCheckJson = await colorCheckRes.json().catch(() => ({ ok: false }));
        
        if (!colorCheckJson.ok || colorCheckJson.allowed === false) {
          const cardColors = colorCheckJson.cardColors || [];
          const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
          const cardColorNames = cardColors.map((c: string) => colorNames[c] || c).join(', ');
          const allowedColorNames = allowedColors.map((c: string) => colorNames[c.toUpperCase()] || c).join(', ');
          
          alert(`Cannot add "${cardName}" to this Commander deck.\n\n` +
                `Card color identity: ${cardColorNames || 'Colorless'}\n` +
                `Commander colors: ${allowedColorNames}\n\n` +
                `In Commander format, all cards must match your commander's color identity.`);
          return;
        }
      } catch (colorCheckError) {
        console.warn('Color identity check failed, proceeding anyway:', colorCheckError);
        // Continue with adding if color check fails (fallback to allow the add)
      }
    }

    // Optimistic update - add card immediately to UI
    const tempId = `temp-${Date.now()}`;
    const optimisticCard: CardRow = {
      id: tempId,
      deck_id: deckId,
      name: n,
      qty: q,
      created_at: new Date().toISOString(),
    };
    
    setCards(prev => [...prev, optimisticCard]);
    window.dispatchEvent(new CustomEvent("toast", { detail: `Added x${q} ${n}` }));

    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, qty: q }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      
      if (!json.ok) {
        // Revert optimistic update
        setCards(prev => prev.filter(c => c.id !== tempId));
        
        const retry = confirm(`Failed to add ${n}. Retry?`);
        if (retry) {
          add(n, q, n); // Use validated name directly
        }
        return;
      }

      // Track successful card addition
      capture('deck_card_added', {
        deck_id: deckId,
        card_name: n,
        quantity: q,
        method: 'search'
      });

      // Replace temp card with real card from server
      await load();
      try { window.dispatchEvent(new Event('deck:changed')); } catch {}
    } catch (err) {
      // Revert on network error
      setCards(prev => prev.filter(c => c.id !== tempId));
      
      const retry = confirm(`Network error adding ${n}. Retry?`);
      if (retry) {
        add(n, q, n); // Use validated name directly
      }
    }
  }

  async function importDecklist() {
    if (!deckId) return;
    const text = pasteText.trim();
    if (!text) {
      setPasteStatus("Paste a decklist first.");
      return;
    }
    setPasteBusy(true);
    setPasteStatus("Importing decklist…");
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckText: text }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Failed to parse server response" }));
      if (!json?.ok) {
        setPasteStatus(json?.error || "Import failed.");
        return;
      }
      setPasteStatus("Decklist imported successfully.");
      setPasteText("");
      await load();
      try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      window.dispatchEvent(new CustomEvent("toast", { detail: "Decklist imported" }));
    } catch (e: any) {
      setPasteStatus(e?.message || "Import failed.");
    } finally {
      setPasteBusy(false);
    }
  }

  async function delta(id: string, d: number) {
    if (!deckId) return;
    
    // Optimistic update - immediately change quantity in UI
    const card = cards.find(c => c.id === id);
    if (!card) return;
    
    const previousQty = card.qty;
    const newQty = previousQty + d;
    
    // If quantity would go to 0 or below, remove the card
    if (newQty <= 0) {
      setCards(prev => prev.filter(c => c.id !== id));
    } else {
      setCards(prev => prev.map(c => c.id === id ? { ...c, qty: newQty } : c));
    }
    
    window.dispatchEvent(new CustomEvent("toast", { detail: d > 0 ? "Added +1" : "Removed -1" }));
    setBusyId(id);
    
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, delta: d }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
      
      if (!json.ok) {
        // Revert optimistic update
        if (newQty <= 0) {
          setCards(prev => [...prev, { ...card, qty: previousQty }]);
        } else {
          setCards(prev => prev.map(c => c.id === id ? { ...c, qty: previousQty } : c));
        }
        
        const retry = confirm(`Failed to update ${card.name}. Retry?`);
        if (retry) {
          delta(id, d);
        }
        return;
      }
      
      // Track card quantity changes
      capture('deck_card_quantity_changed', {
        deck_id: deckId,
        card_name: card.name,
        old_quantity: previousQty,
        new_quantity: newQty,
        method: 'button_click'
      });
      
      // Reload to ensure sync with server
      await load();
      try { window.dispatchEvent(new Event('deck:changed')); } catch {}
    } catch (e: any) {
      // Revert on network error
      if (newQty <= 0) {
        setCards(prev => [...prev, { ...card, qty: previousQty }]);
      } else {
        setCards(prev => prev.map(c => c.id === id ? { ...c, qty: previousQty } : c));
      }
      
      const retry = confirm(`Network error. Retry?`);
      if (retry) {
        delta(id, d);
      }
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === cards.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(cards.map(c => c.id)));
    }
  }

  async function bulkDelete() {
    if (!deckId || selected.size === 0) return;
    
    const cardsToDelete = cards.filter(c => selected.has(c.id));
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    // OPTIMISTIC UI: Remove from UI immediately
    setCards(prev => prev.filter(c => !selected.has(c.id)));
    setSelected(new Set());
    
    // Track bulk delete
    try {
      capture('bulk_delete_cards', {
        deck_id: deckId,
        count: cardsToDelete.length,
        card_names: cardsToDelete.map(c => c.name).join(', ')
      });
    } catch {}
    
    // Delete from database immediately (in background)
    const deletePromises = cardsToDelete.map(card =>
      fetch(`/api/decks/cards?id=${encodeURIComponent(card.id)}&deckid=${encodeURIComponent(deckId)}`, {
        method: "DELETE"
      })
    );
    
    // Execute all deletions
    Promise.all(deletePromises)
      .then(() => {
        try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      })
      .catch((e) => {
        // Reload to show actual state if deletion failed
        load();
      });
    
    // Show undo toast
    undoToastManager.showUndo({
      id: 'bulk-delete-cards',
      message: `${cardsToDelete.length} card${cardsToDelete.length > 1 ? 's' : ''} deleted`,
      duration: 8000,
      onUndo: async () => {
        // Restore all deleted cards
        try {
          for (const card of cardsToDelete) {
            await fetch(`/api/decks/cards`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deckId, name: card.name, qty: card.qty }),
            });
          }
          window.dispatchEvent(new CustomEvent("toast", { detail: `Restored ${cardsToDelete.length} cards` }));
          await load();
          try { window.dispatchEvent(new Event('deck:changed')); } catch {}
        } catch (e) {
          alert('Failed to undo deletion');
        }
      },
      onExecute: () => {
        // Already executed above, this is just for the toast interface
      },
    });
  }

  async function remove(id: string, name: string, qty: number) {
    if (!deckId) return;
    
    // INSTANT UPDATE: Remove from UI immediately (optimistic)
    const cardToRemove = cards.find(c => c.id === id);
    if (!cardToRemove) return;
    
    setCards(prev => prev.filter(c => c.id !== id));
    
    // Use undo toast with 8 second window
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    undoToastManager.showUndo({
      id: `remove-card-${id}`,
      message: `Removed ${qty}x ${name}`,
      duration: 8000, // 8 seconds as requested
      onUndo: async () => {
        // Restore card to UI immediately
        setCards(prev => [...prev, cardToRemove]);
        
        // Don't need to call API - card was never actually deleted yet
        window.dispatchEvent(new CustomEvent("toast", { detail: `Restored ${qty}x ${name}` }));
        try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      },
      onExecute: async () => {
        // Actually delete from database (only runs if undo not clicked within 8 seconds)
        try {
          const res = await fetch(`/api/decks/cards?id=${encodeURIComponent(id)}&deckid=${encodeURIComponent(deckId)}`, {
            method: "DELETE",
          });
          const json = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
          if (!json.ok) {
            // If delete fails, restore the card
            setCards(prev => [...prev, cardToRemove]);
            throw new Error(json.error || "Delete failed");
          }
          
          // Track card removal
          capture('deck_card_removed', {
            deck_id: deckId,
            card_name: name,
            quantity: qty,
          });
          
          try { window.dispatchEvent(new Event('deck:changed')); } catch {}
        } catch (e: any) {
          alert(e?.message || "Error deleting card");
          // Restore on error
          setCards(prev => [...prev, cardToRemove]);
        }
      },
    });
  }

  // render each actual row (not grouped), sorted by name for a stable view
  const rows = useMemo(() => [...cards].sort((a, b) => a.name.localeCompare(b.name)), [cards]);

  // Scryfall images (thumb + hover)
  const [imgMap, setImgMap] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [pv, setPv] = useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({ src: "", x: 0, y: 0, shown: false, below: false });

  // Currency toggle + snapshot prices per normalized name
  // Important: avoid reading localStorage during initial render to prevent hydration mismatches.
  const [currency, setCurrency] = useState<string>('USD');
  useEffect(() => { try { const saved = localStorage.getItem('price_currency'); if (saved && saved !== 'USD') setCurrency(saved); } catch {} }, []);
  useEffect(()=>{ try { localStorage.setItem('price_currency', currency); } catch {} }, [currency]);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [priceLoading, setPriceLoading] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set(rows.map(r => r.name)));
        if (!names.length) { setPriceMap({}); setPriceLoading(false); return; }
        
        setPriceLoading(true);
        // Clear price map when currency or cards change to avoid stale data
        setPriceMap({});
        
        // Normalize card names the same way as snapshot API
        const norm = (s: string) => String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
        
        // Step 1: Try snapshot prices first (with cache busting for currency changes)
        const r1 = await fetch('/api/price/snapshot', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ names, currency }), cache: 'no-store' });
        const j1 = await r1.json().catch(()=>({ ok:false }));
        let prices: Record<string, number> = (r1.ok && j1?.ok && j1.prices) ? j1.prices : {};
        
        // Step 2: Find missing cards and fetch from Scryfall
        const normalizedNames = Array.from(new Set(rows.map(r => norm(r.name))));
        const missingNames = normalizedNames.filter(n => !prices[n] || prices[n] === 0);
        
        if (missingNames.length > 0) {
          try {
            // Process in batches of 75 (Scryfall's limit)
            for (let i = 0; i < missingNames.length; i += 75) {
              const batch = missingNames.slice(i, i + 75);
              try {
                // Get original card names back (from rows) - use exact names for Scryfall lookup
                const originalNames = batch.map(normName => {
                  const found = rows.find(r => norm(r.name) === normName);
                  return found ? found.name : normName;
                });
                const identifiers = originalNames.map(n=>({ name: n }));
                const r2 = await fetch('https://api.scryfall.com/cards/collection', {
                  method:'POST',
                  headers:{'content-type':'application/json'},
                  body: JSON.stringify({ identifiers })
                });
                const j2:any = await r2.json().catch(()=>({}));
                const arr:any[] = Array.isArray(j2?.data)? j2.data: [];
                
                let foundCount = 0;
                for (const c of arr) {
                  const nm = norm(c?.name||'');
                  const cardPrices = c?.prices || {};
                  const key = currency==='EUR' ? 'eur' : currency==='GBP' ? 'gbp' : 'usd';
                  
                  // Try primary price key first
                  let v = cardPrices?.[key];
                  
                  // For USD, try fallback keys if primary is missing (reserved list cards often only have foil prices)
                  if ((!v || v === null || v === 0) && currency === 'USD') {
                    v = cardPrices?.usd_foil || cardPrices?.usd_etched || cardPrices?.usd;
                  }
                  
                  // For EUR, try foil fallback
                  if ((!v || v === null || v === 0) && currency === 'EUR') {
                    v = cardPrices?.eur_foil || cardPrices?.eur;
                  }
                  
                  // For GBP, try foil fallback
                  if ((!v || v === null || v === 0) && currency === 'GBP') {
                    v = cardPrices?.gbp_foil || cardPrices?.gbp;
                  }
                  
                  if (v!=null && v > 0 && !isNaN(Number(v))) {
                    prices[nm] = Number(v);
                    foundCount++;
                  } else {
                    // Last resort: try to fetch cheapest printing if this card has prints_search_uri
                    const priceKeys = Object.keys(cardPrices || {}).filter(k => cardPrices[k] != null);
                    const onlyHasTix = priceKeys.length === 1 && priceKeys[0] === 'tix';
                    if (c?.prints_search_uri && (!priceKeys.length || onlyHasTix)) {
                      try {
                        const printsRes = await fetch(c.prints_search_uri, { cache: 'no-store' });
                        const printsData = await printsRes.json().catch(() => ({}));
                        const printCards = Array.isArray(printsData?.data) ? printsData.data : [];
                        
                        // Find cheapest non-foil price across all printings
                        let cheapest: number | null = null;
                        for (const print of printCards) {
                          const printPrices = print?.prices || {};
                          const priceKey = currency==='EUR' ? 'eur' : currency==='GBP' ? 'gbp' : 'usd';
                          
                          // Try primary price first
                          let pv = printPrices?.[priceKey];
                          
                          // Fallback to foil if needed (for USD)
                          if ((!pv || pv === null || pv === 0) && currency === 'USD') {
                            pv = printPrices?.usd_foil || printPrices?.usd_etched || printPrices?.usd;
                          }
                          
                          if (pv != null && pv > 0 && !isNaN(Number(pv))) {
                            const priceNum = Number(pv);
                            cheapest = cheapest === null ? priceNum : Math.min(cheapest, priceNum);
                          }
                        }
                        
                        if (cheapest !== null && cheapest > 0) {
                          prices[nm] = cheapest;
                          foundCount++;
                        }
                      } catch (printError) {
                        // Silently fail
                      }
                    }
                  }
                }
              } catch (batchError) {
                // Continue with next batch if one fails
              }
            }
          } catch (fallbackError) {
            // Silently fail
          }
        }
        // Update priceMap with combined snapshot + Scryfall prices
        setPriceMap(prices);
        setPriceLoading(false);
      } catch { 
        setPriceMap({}); 
        setPriceLoading(false);
      }
    })();
  }, [rows.map(r=>r.name).join('|'), currency]);
  useEffect(() => {
    (async () => {
      try {
        const names = Array.from(new Set(rows.map(r => r.name))).slice(0, 300);
        if (!names.length) { setImgMap({}); return; }
        const { getImagesForNames } = await import("@/lib/scryfall");
        const m = await getImagesForNames(names);
        const obj: any = {}; m.forEach((v: any, k: string) => { obj[k] = { small: v.small, normal: v.normal }; });
        setImgMap(obj);
      } catch { setImgMap({}); }
    })();
  }, [rows.map(r=>r.name).join('|')]);

  const calcPos = (e: MouseEvent | any) => {
    try {
      const vw = window.innerWidth; const vh = window.innerHeight;
      const margin = 12; const boxW = 320; const boxH = 460; // approximate
      const half = boxW / 2;
      const rawX = e.clientX as number;
      const rawY = e.clientY as number;
      const below = rawY - boxH - margin < 0; // if not enough room above, render below
      const x = Math.min(vw - margin - half, Math.max(margin + half, rawX));
      const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin);
      return { x, y, below };
    } catch {
      return { x: (e as any).clientX || 0, y: (e as any).clientY || 0, below: false };
    }
  };

  return (
    <div className="mt-2" onKeyDown={(e)=>{
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;
      if (!isTyping && e.key === '/') {
        e.preventDefault();
        try { const el = addBarRef.current?.querySelector('input,textarea'); (el as any)?.focus?.(); } catch {}
      }
    }}>
      {/* Search + quick add */}
      <div className="max-w-xl space-y-3" ref={addBarRef}>
        <EditorAddBar onAdd={add} />
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
        >
          {pasteOpen ? "Hide decklist paste" : "Paste a full decklist"}
        </button>
        {pasteOpen && (
          <div className="space-y-2">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"4 Lightning Bolt\n3 Fable of the Mirror-Breaker\nCommander decks: use \"1 Card Name\" per line"}
              className="w-full h-36 rounded border border-neutral-700 bg-black/40 px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                Card names auto-correct to official Oracle names.
              </span>
              <button
                type="button"
                onClick={importDecklist}
                disabled={pasteBusy}
                className="rounded bg-blue-500 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50"
              >
                {pasteBusy ? "Importing…" : "Import Decklist"}
              </button>
            </div>
            {pasteStatus && <p className="text-xs text-neutral-300">{pasteStatus}</p>}
          </div>
        )}
      </div>

      {status && <p className="text-red-400 text-sm mt-2">{status}</p>}

      {/* Currency toggle and bulk actions */}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <>
              <button
                onClick={toggleSelectAll}
                className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors"
              >
                {selected.size === cards.length && cards.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              {selected.size > 0 && (
                <button
                  onClick={bulkDelete}
                  className="px-2 py-1 rounded bg-neutral-800 hover:bg-red-600/80 text-neutral-400 hover:text-white transition-colors flex items-center gap-1.5"
                  title={`Delete ${selected.size} card${selected.size > 1 ? 's' : ''}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="text-xs">{selected.size}</span>
                </button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="opacity-70">Currency</label>
          <select value={currency} onChange={e=>setCurrency(e.target.value)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2" ref={listRef}>
        {rows.map((c, idx) => (
          <div
            key={c.id}
            data-row-index={idx}
            className="flex items-center justify-between rounded border border-neutral-700 px-3 py-2 md:px-4 md:py-3 min-h-[44px] focus:outline-none focus:ring-1 focus:ring-emerald-600 hover:bg-neutral-800/50 transition-colors cursor-pointer"
            tabIndex={0}
            onKeyDown={(e)=>{
              if ((e.target as HTMLElement)?.tagName?.toLowerCase() === 'input') return;
              if (/^[1-9]$/.test(e.key)) { const to = parseInt(e.key,10); if (Number.isFinite(to)) { const diff = to - c.qty; if (diff !== 0) delta(c.id, diff); e.preventDefault(); } }
              if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(c.id, c.name, c.qty); }
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const parent = listRef.current; if (!parent) return;
                const nodes = parent.querySelectorAll('[data-row-index]');
                const me = e.currentTarget as HTMLElement;
                const myIndex = Number((me.getAttribute('data-row-index')||'0'));
                const next = e.key === 'ArrowDown' ? Math.min(nodes.length - 1, myIndex + 1) : Math.max(0, myIndex - 1);
                const target = nodes.item(next) as HTMLElement | null; target?.focus?.();
              }
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggleSelect(c.id)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-emerald-600 focus:ring-emerald-600 focus:ring-offset-0"
                onClick={(e) => e.stopPropagation()}
              />
              <input
                type="number"
                className="w-14 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-center"
                min={0}
                step={1}
                value={c.qty}
                onChange={(e)=>{ const v = Math.max(0, parseInt(e.target.value||'0',10)); const d = v - c.qty; if (d!==0) delta(c.id, d); }}
              />
              {(() => { 
                let key = c.name.toLowerCase(); 
                let src = imgMap[key]?.small;
                let normalSrc = imgMap[key]?.normal;
                
                // For DFCs, try to find any DFC with the same front face
                if (!src && c.name.includes('//')) {
                  const frontFace = c.name.split('//')[0].trim().toLowerCase();
                  
                  // Try simple front face match
                  src = imgMap[frontFace]?.small;
                  normalSrc = imgMap[frontFace]?.normal;
                  
                  // If still no match, search imgMap for valid DFCs starting with this front face
                  if (!src) {
                    const imgKeys = Object.keys(imgMap).filter(k => {
                      if (!k.includes('//') || !k.startsWith(frontFace + ' //')) return false;
                      // Filter out invalid DFCs (same name on both faces)
                      const parts = k.split('//').map((p: string) => p.trim());
                      return parts[0] !== parts[1];
                    });
                    if (imgKeys.length > 0) {
                      src = imgMap[imgKeys[0]]?.small;
                      normalSrc = imgMap[imgKeys[0]]?.normal;
                      key = imgKeys[0];
                    }
                  } else {
                    key = frontFace;
                  }
                }
                
                return src ? (
                  <img src={src} alt={c.name} loading="lazy" decoding="async" className="w-[24px] h-[34px] object-cover rounded"
                    onMouseEnter={(e)=>{ const { x, y, below } = calcPos(e as any); setPv({ src: normalSrc || src, x, y, shown: true, below }); }}
                    onMouseMove={(e)=>{ const { x, y, below } = calcPos(e as any); setPv(p=>p.shown?{...p, x, y, below}:p); }}
                    onMouseLeave={()=>setPv(p=>({...p, shown:false}))}
                  />
                ) : null; 
              })()}
              <a className="hover:underline truncate max-w-[40vw]" href={`https://scryfall.com/search?q=!\"${encodeURIComponent(c.name)}\"`} target="_blank" rel="noreferrer">{c.name}</a>
            </div>

            <div className="flex items-center gap-2">
              {(() => { try { 
                const key = c.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); 
                let unit = priceMap[key];
                let hasImg = !!imgMap[c.name.toLowerCase()]?.small;
                
                // For DFCs, try matching any DFC with the same front face
                if (!unit && !hasImg && c.name.includes('//')) {
                  const frontFace = c.name.split('//')[0].trim();
                  const frontKey = frontFace.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
                  
                  // Try simple front face match first
                  unit = priceMap[frontKey];
                  hasImg = !!imgMap[frontFace.toLowerCase()]?.small;
                  
                  // If still no match, search priceMap for valid DFCs starting with this front face
                  if (!unit) {
                    const dfcKeys = Object.keys(priceMap).filter(k => {
                      if (!k.includes('//') || !k.startsWith(frontKey + ' //')) return false;
                      // Filter out invalid DFCs (same name on both faces)
                      const parts = k.split('//').map((p: string) => p.trim());
                      return parts[0] !== parts[1];
                    });
                    if (dfcKeys.length > 0) {
                      unit = priceMap[dfcKeys[0]];
                    }
                  }
                  
                  // Same for images - prefer valid DFCs
                  if (!hasImg) {
                    const imgKeys = Object.keys(imgMap).filter(k => {
                      if (!k.includes('//') || !k.startsWith(frontFace.toLowerCase() + ' //')) return false;
                      // Filter out invalid DFCs
                      const parts = k.split('//').map((p: string) => p.trim());
                      return parts[0] !== parts[1];
                    });
                    if (imgKeys.length > 0) {
                      hasImg = !!imgMap[imgKeys[0]]?.small;
                    }
                  }
                }
                
                if (unit>0) { 
                  const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$'); 
                  return (
                    <span className="text-xs opacity-80 w-40 text-right tabular-nums">
                      {sym}{(unit*c.qty).toFixed(2)} <span className="opacity-60">• {sym}{unit.toFixed(2)} each</span>
                    </span>
                  );
                } else if (priceLoading) {
                  return (
                    <span className="text-xs opacity-60 w-40 text-right">
                      Loading...
                    </span>
                  );
                } else { 
                  return (
                    <span className="text-xs opacity-60 w-40 text-right">
                      — {(!hasImg) && (<button className="underline text-cyan-400 ml-1 hover:text-cyan-300 transition-colors" onClick={()=>setFixModalCard({ id: c.id, name: c.name })}>fix?</button>)}
                    </span>
                  );
                }
              } catch {}
              return (<span className="text-xs opacity-40 w-40 text-right">— <button className="underline text-cyan-400 ml-1 hover:text-cyan-300 transition-colors" onClick={()=>setFixModalCard({ id: c.id, name: c.name })}>fix?</button></span>);
              })()}
              <button
                className="ml-3 p-1.5 text-neutral-400 hover:text-red-400 rounded hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                onClick={() => remove(c.id, c.name, c.qty)}
                disabled={busyId === c.id}
                title="Delete card"
                aria-label="Delete card"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 && !status && (
          <p className="text-sm opacity-70">No cards yet — try adding <em>Sol Ring</em>?</p>
        )}
      </div>

      {/* Totals */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs opacity-70">Cards: <span className="font-mono">{rows.reduce((s,c)=>s+c.qty,0)}</span></div>
        {(() => { try {
          const total = rows.reduce((acc, c) => {
            const norm = c.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
            const unit = priceMap[norm] || 0; return acc + unit * c.qty;
          }, 0);
          const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$');
          return (<div className="text-sm opacity-90">Est. total (snapshot): <span className="font-mono">{sym}{total.toFixed(2)}</span></div>);
        } catch { return null; } })()}
      </div>

      {/* Global hover preview for card images */}
      {pv.shown && typeof window !== 'undefined' && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: pv.x, top: pv.y, transform: `translate(-50%, ${pv.below ? '0%' : '-100%'})` }}>
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100" style={{ minWidth: '18rem' }}>
            <img src={pv.src} alt="preview" className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" />
          </div>
        </div>
      )}

      {/* Fix single card modal */}
      <FixSingleCardModal
        card={fixModalCard}
        deckId={deckId || ''}
        open={!!fixModalCard}
        onClose={() => setFixModalCard(null)}
        onSuccess={() => load()}
      />
      
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
                    <div className="text-xs text-neutral-500 mt-0.5">Qty: {it.qty}</div>
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
              <button onClick={() => { setShowAddValidation(false); setAddValidationItems([]); setPendingAddName(''); }} className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={async()=>{
                try {
                  const correctedName = addValidationItems[0]?.choice || addValidationItems[0]?.originalName;
                  const qty = addValidationItems[0]?.qty || pendingAddQty || 1;
                  if (!correctedName) return;
                  
                  setShowAddValidation(false);
                  setAddValidationItems([]);
                  setPendingAddName('');
                  
                  // Add with corrected name
                  await add(correctedName, qty, correctedName);
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
    </div>
  );
}

