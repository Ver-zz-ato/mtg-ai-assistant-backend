// components/ImportDeckForMath.tsx
"use client";
import * as React from "react";

// Minimal type for deck listing
type DeckRow = { id: string; title?: string | null };

export default function ImportDeckForMath({
  onApply,
  storageKey,
  label = "Import from My Decks",
}: {
  onApply: (vals: { deckId: string; deckSize: number; successCards: number }) => void;
  storageKey: "prob" | "mull";
  label?: string;
}) {
  const [decks, setDecks] = React.useState<DeckRow[]>([]);
  const [deckId, setDeckId] = React.useState<string>("");
  const [filter, setFilter] = React.useState<string>("");
  const [deckSize, setDeckSize] = React.useState<number>(0);
  const [successCards, setSuccessCards] = React.useState<number>(0);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<{ lands: number; ramp: number; draw: number; removal: number } | null>(null);
  const [cards, setCards] = React.useState<Array<{ name: string; qty: number }>>([]);
  const [cardQuery, setCardQuery] = React.useState<string>("");
  const [selected, setSelected] = React.useState<string[]>([]);

  // Load deck list on mount and preselect from query/localStorage
  React.useEffect(() => {
    let initial = "";
    try {
      const sp = new URLSearchParams(window.location.search);
      initial = sp.get("deckId") || sp.get("deck") || localStorage.getItem(`${storageKey}:deck`) || "";
    } catch {}

    (async () => {
      try {
        const res = await fetch("/api/decks/my", { cache: "no-store" });
        const json = await res.json().catch(()=>({ ok:false }));
        if (!res.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${res.status}`);
        const list = Array.isArray(json.decks) ? json.decks : [];
        setDecks(list);
        if (initial && list.find((d:any)=>d.id===initial)) setDeckId(initial);
      } catch (e:any) {
        setErr(e?.message || "Failed to fetch decks");
      }
    })();
  }, [storageKey]);

  // When deckId changes, fetch its cards and compute totals
  React.useEffect(() => {
    if (!deckId) { setDeckSize(0); setSuccessCards(0); return; }
    setLoading(true); setErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: "no-store" });
        const json = await res.json().catch(()=>({ ok:false }));
        if (!res.ok || json?.ok === false) throw new Error(json?.error || `HTTP ${res.status}`);
        const cardsList: Array<{ name: string; qty: number }> = Array.isArray(json.cards) ? json.cards : [];
        setCards(cardsList);
        const total = cardsList.reduce((s,c)=> s + (Number(c.qty)||0), 0);
        setDeckSize(total);
        // apply current filter for K (ignored if a multi-select exists)
        const f = filter.trim().toLowerCase();
        const k = !f ? 0 : cardsList.filter(c => String(c.name||"").toLowerCase().includes(f)).reduce((s,c)=> s + (c.qty||0), 0);
        if (selected.length === 0) setSuccessCards(k);
        try { localStorage.setItem(`${storageKey}:deck`, deckId); } catch {}

        // Fetch deck_text then analyze for category counts (presets)
        try {
          const metaRes = await fetch(`/api/decks/get?id=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
          const meta = await metaRes.json().catch(()=>({}));
          const deckText = String(meta?.deck?.deck_text || '');
          if (deckText) {
            const ar = await fetch('/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deckText, useScryfall: true }) });
            const body = await ar.text();
            let parsed: any = null; try { parsed = JSON.parse(body); } catch {}
            const result = parsed?.result ?? parsed;
            if (ar.ok && result && result.counts) setCounts(result.counts as any);
          } else {
            setCounts(null);
          }
        } catch {}
      } catch (e:any) {
        setErr(e?.message || "Failed to fetch deck cards");
      } finally {
        setLoading(false);
      }
    })();
  }, [deckId, filter, storageKey]);

  const apply = () => {
    if (!deckId) return;
    onApply({ deckId, deckSize, successCards });
  };

  const useCount = (k: keyof NonNullable<typeof counts>) => {
    if (!counts) return; setSuccessCards(Math.max(0, Number((counts as any)[k] || 0)));
  };

  const useCard = () => {
    const q = cardQuery.trim().toLowerCase();
    if (!q) return;
    const c = cards.find(x => x.name.toLowerCase() === q) || cards.find(x => x.name.toLowerCase().includes(q));
    if (c) {
      setSelected(prev => prev.includes(c.name) ? prev : [...prev, c.name]);
      setCardQuery("");
    }
  };

  // Recompute K from multi-select whenever it changes
  React.useEffect(() => {
    if (selected.length === 0) return; // don't override if empty
    const names = new Set(selected.map(s => s.toLowerCase()));
    const sum = cards.filter(c => names.has(c.name.toLowerCase())).reduce((s,c)=> s + (c.qty||0), 0);
    setSuccessCards(sum);
  }, [selected, cards]);

  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/60 p-3 space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          className="min-w-0 flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
          value={deckId}
          onChange={(e) => setDeckId(e.target.value)}
        >
          <option value="">Select a deck…</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>{(d.title || "Untitled deck")}</option>
          ))}
        </select>
        <input
          value={filter}
          onChange={(e)=>setFilter(e.target.value)}
          placeholder="Count cards matching… (optional)"
          className="min-w-0 flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
        />
        <button onClick={apply} disabled={!deckId || loading} className="px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-60 text-sm">Use</button>
      </div>
      <div className="text-xs opacity-80">
        {loading ? "Loading…" : deckId ? (
          <>Deck size: <span className="font-mono">{deckSize}</span>{selected.length > 0 ? (
            <> • K (selected {selected.length}): <span className="font-mono">{successCards}</span></>
          ) : filter ? (
            <> • K (matches): <span className="font-mono">{successCards}</span></>
          ) : null}</>
        ) : "Pick a deck to auto-fill N. Add a match term or select cards to set K."}
      </div>

      {/* Preset chips from analysis */}
      {counts && (
        <div className="text-xs flex flex-wrap gap-2">
          <span className="opacity-70">Set K to:</span>
          <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={()=>useCount('lands')}>Lands: {counts.lands}</button>
          <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={()=>useCount('ramp')}>Ramp: {counts.ramp}</button>
          <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={()=>useCount('draw')}>Draw: {counts.draw}</button>
          <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={()=>useCount('removal')}>Removal: {counts.removal}</button>
        </div>
      )}

      {/* Multi-select card autocomplete */}
      {cards.length > 0 && (
        <div className="text-xs space-y-2">
          <div className="flex items-center gap-2">
            <input list={`cards-${storageKey}`} value={cardQuery} onChange={(e)=>setCardQuery(e.target.value)} placeholder="Add specific card(s) to sum for K" className="min-w-0 flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
            <datalist id={`cards-${storageKey}`}>
              {cards.map(c => <option key={c.name} value={c.name}>{c.name} (x{c.qty})</option>)}
            </datalist>
            <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={useCard}>Add</button>
            {selected.length > 0 && (
              <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={()=>setSelected([])}>Clear</button>
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selected.map(name => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-neutral-800">
                  <span>{name}</span>
                  <button onClick={()=>setSelected(sel => sel.filter(n => n !== name))} className="text-red-300">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <div className="text-xs text-red-400">{err}</div>}
    </div>
  );
}
