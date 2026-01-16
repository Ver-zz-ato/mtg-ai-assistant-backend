"use client";
import React from "react";
import CardRowPreviewLeft from "@/components/shared/CardRowPreview";
import FixDeckNamesModal from "@/components/FixDeckNamesModal";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useProStatus } from "@/hooks/useProStatus";
import { useAuth } from "@/lib/auth-context";
import { track } from "@/lib/analytics/track";
import { motion, AnimatePresence } from "framer-motion";
import { getManaGlow } from "@/lib/mana-colors";

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
  const { isPro } = useProStatus();
  const { user } = useAuth();

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

  // Deck context
  const [commanderArt, setCommanderArt] = React.useState<string>('');
  const [commanderName, setCommanderName] = React.useState<string>('');
  const [deckTitle, setDeckTitle] = React.useState<string>('');

  // Batch selection
  const [selectedSwaps, setSelectedSwaps] = React.useState<Set<number>>(new Set());
  const [showSuccessModal, setShowSuccessModal] = React.useState(false);
  const [newDeckLink, setNewDeckLink] = React.useState<string>('');
  
  // Name fixing for pasted deck text
  const [fixNamesOpen, setFixNamesOpen] = React.useState(false);
  const [fixNamesItems, setFixNamesItems] = React.useState<Array<{ originalName: string; qty: number; suggestions: string[] }>>([]);
  const [pendingDeckText, setPendingDeckText] = React.useState<string>("");

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

  // Fetch commander art when deck is selected - EXACT copy from Cost to Finish
  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!deckId) { 
        setCommanderArt('');
        setCommanderName('');
        setDeckTitle('');
        return; 
      }
      
      try {
        const sb = createBrowserSupabaseClient();
        
        // First ensure we have auth
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          return;
        }
        
        // Note: color_identity column doesn't exist, removed from query
        let { data, error } = await sb
          .from("decks")
          .select("deck_text, title, commander")
          .eq("id", deckId)
          .single();
        
        if (!alive) return;
        if (error) {
          return;
        }
        
        if (!data) {
          return;
        }
        
        if (data.deck_text) setDeckText(String(data.deck_text));
        const title = String(data.title || '').trim();
        let commander = String((data as any).commander || '').trim();
        
        // Fallback: derive commander from first line like Cost to Finish does
        if (!commander) {
          try {
            const raw = String(data.deck_text || '');
            const first = raw.split(/\r?\n/).map(s=>s.trim()).find(Boolean) || title;
            const m0 = first.match(/^(\d+)\s*[xX]?\s+(.+)$/);
            commander = (m0 ? m0[2] : first).replace(/\s*\(.*?\)\s*$/, '').trim();
          } catch {}
        }
        
        setDeckTitle(title);
        setCommanderName(commander);
        
        let art: string | undefined;
        
        // Prefer server-side banner-art API (uses cached scryfall, deck cards, robust fallbacks)
        try {
          const r = await fetch(`/api/profile/banner-art?signatureDeckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
          const j = await r.json().catch(()=>({ ok:false }));
          if (r.ok && j?.ok && j.art) {
            art = String(j.art);
          }
        } catch (e) {
          // Silently fail
        }

        // Fallback to direct commander image fetch if server route fails
        if (!art && commander) {
          try {
            const { getImagesForNames } = await import('@/lib/scryfall-cache');
            const names = [commander];
            const m = await getImagesForNames(names);
            const key = names[0]?.toLowerCase()?.normalize('NFKD')?.replace(/[\u0300-\u036f]/g,'')?.replace(/\s+/g,' ')?.trim();
            const img = key ? m.get(key) : null;
            art = img?.art_crop || img?.normal || img?.small;
          } catch (e) {
            // Silently fail
          }
        }

        if (!alive) return;
        if (art) {
          setCommanderArt(art);
        } else {
          setCommanderArt('');
        }
      } catch (err) {
        // Silently fail
      }
    })();
    return () => { alive = false; };
  }, [deckId]);

  const isProFinal = isPro || isProLocal;
  const hasResults = sugs.length > 0;

  const compute = async (): Promise<Sug[]|null> => {
    if (mode === 'ai' && !isProFinal){
      try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('AI swaps are a Pro feature.'); }
      return null;
    }
    if (!deckText.trim()) { setError('Please paste your decklist.'); return null; }
    
    // If deckText is provided (not from deckId), check names first
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
            return null; // Don't proceed until names are fixed
          } else if (j.cards && j.cards.length > 0) {
            // All names are good, update deckText with corrected names
            const correctedText = j.cards.map((c: any) => `${c.qty} ${c.name}`).join('\n');
            setDeckText(correctedText);
          }
        }
      } catch (e: any) {
        // Continue anyway
      }
    }
    
    // Track UI click (already done via track helper)
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
      
      // Log activity if savings found
      if (top.length > 0) {
        const totalDelta = top.reduce((a,s)=> a + (Number(s.price_delta)||0), 0);
        const calculatedSavings = -Math.min(0, totalDelta);
        if (calculatedSavings > 0) {
          try {
            const fmt = (n:number)=> new Intl.NumberFormat(undefined, { style:'currency', currency }).format(Number(n||0));
            await fetch('/api/stats/activity/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'budget_saved',
                message: `Budget swaps saved ${fmt(calculatedSavings)}`,
              }),
            });
          } catch {}
        }
      }
      
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

  // Batch selection functions
  const toggleSelection = (idx: number) => {
    const newSet = new Set(selectedSwaps);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setSelectedSwaps(newSet);
  };

  const clearSelection = () => {
    setSelectedSwaps(new Set());
  };

  const applySwapsToDeck = async () => {
    if (!isProFinal) {
      try { const { showProToast } = await import('@/lib/pro-ux'); showProToast(); } catch { alert('Apply to Deck is a Pro feature'); }
      return;
    }

    if (!deckId) {
      alert('Please select a deck first');
      return;
    }

    try {
      const swapsToApply = Array.from(selectedSwaps).map(idx => sugs[idx]);
      
      // Create modifications
      const cardsToRemove = swapsToApply.map(s => s.from);
      const cardsToAdd = swapsToApply.map(s => s.to);

      // Build new deck text
      const lines = deckText.split('\n');
      const newLines = lines.filter(line => {
        const cardName = line.replace(/^\d+\s+/, '').trim();
        return !cardsToRemove.some(remove => cardName.toLowerCase().includes(remove.toLowerCase()));
      });
      
      // Add new cards
      cardsToAdd.forEach(card => {
        newLines.push(`1 ${card}`);
      });

      const newDeckText = newLines.join('\n');

      // Create forked deck
      const res = await fetch('/api/decks/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `${deckTitle || 'My Deck'} (Budget Swaps)`,
          deck_text: newDeckText,
          commander: commanderName
        })
      });

      if (!res.ok) throw new Error('Failed to create deck');

      const { id: newId } = await res.json();
      setNewDeckLink(`/my-decks/${newId}`);
      setShowSuccessModal(true);
      clearSelection();
    } catch (e: any) {
      alert(e?.message || 'Failed to apply swaps');
    }
  };

  return (
    <div className="w-full">
      {/* Enhanced sticky header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-t-2xl border-b border-neutral-800 bg-gradient-to-br from-purple-900/20 via-pink-900/10 to-rose-900/20 backdrop-blur-sm p-6 -mx-4 sm:mx-0 mb-4"
      >
        {/* Animated background blobs */}
        <motion.div
          className="absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-30"
          style={{ background: getManaGlow('blue') }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-30"
          style={{ background: getManaGlow('red') }}
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.2, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <motion.span
              className="text-4xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              💎
            </motion.span>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              Budget Swaps
            </h1>
          </div>
          <p className="text-base text-neutral-300 max-w-4xl leading-relaxed">
            Find cheaper versions of your staples — keep your deck's power, not its price tag.
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
            {[
              { icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", text: "Smart Alternatives", color: "text-purple-400" },
              { icon: "M13 10V3L4 14h7v7l9-11h-7z", text: "AI-Powered", color: "text-pink-400" },
              { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", text: "Price Comparison", color: "text-rose-400" }
            ].map((badge, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                className={`flex items-center gap-1.5 ${badge.color}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={badge.icon} />
                </svg>
                <span>{badge.text}</span>
              </motion.div>
            ))}
          </div>
          {!isProFinal && (
            <div className="mt-3 text-xs bg-amber-900/20 border border-amber-600/30 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className="text-amber-400 text-lg">⭐</span>
              <div>
                <span className="font-semibold text-amber-300">Pro Features:</span>
                <span className="text-neutral-300 ml-1">AI-powered suggestions, Moxfield/MTGO exports, deck forking, and price trend analysis.</span>
              </div>
            </div>
          )}
        </div>
      </motion.header>

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
              <button onClick={async () => {
                // Track UI click
                track('ui_click', {
                  area: 'functions',
                  action: 'run',
                  fn: 'budget-swaps',
                }, {
                  userId: user?.id || null,
                  isPro: isPro,
                });
                await compute();
              }} disabled={busy} className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-semibold disabled:opacity-60">{busy? 'Computing…' : 'Compute'}</button>
            </div>
          </div>
        </aside>

        {/* Right: results */}
        <section className="col-span-12 md:col-span-8">
          {/* Deck context - commander art banner */}
          {deckId && commanderArt && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="mb-4 relative rounded-lg overflow-hidden border-2 border-neutral-700"
            >
              <img
                src={commanderArt}
                alt={commanderName}
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
              <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
              <div>
                <div className="font-semibold text-sm text-white drop-shadow-lg">{deckTitle}</div>
                <div className="text-xs text-neutral-200 drop-shadow-lg">{commanderName}</div>
              </div>
            </div>
            </motion.div>
          )}

          {!hasResults ? (
            <div className="space-y-4">
              {/* Quick-start tutorial */}
              {!busy && (
                <div className="mb-4">
                  <div className="text-sm font-semibold mb-3">Quick Start Guide</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { step: '1', text: 'Paste your decklist or select a deck', icon: '📝' },
                      { step: '2', text: 'Set your budget threshold', icon: '💰' },
                      { step: '3', text: 'Click Compute to find savings', icon: '🔍' }
                    ].map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.4 }}
                        className="p-3 rounded-lg border border-neutral-700 bg-neutral-900/50 hover:bg-neutral-900 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                            {item.step}
                          </div>
                          <div className="flex-1">
                            <div className="text-2xl mb-1">{item.icon}</div>
                            <div className="text-xs">{item.text}</div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Guest Example - only show when no results and not busy */}
              {!busy && (
                <div className="rounded-xl border border-blue-500/40 bg-blue-950/20 p-4">
                  <div className="text-sm font-semibold mb-3 text-blue-300 flex items-center gap-2">
                    <span>👁️</span>
                    <span>Example Result Preview</span>
                  </div>
                  <div className="text-xs text-neutral-300 mb-3">Here's what Budget Swaps looks like for a sample competitive deck.</div>
                  
                  {/* Mock deck banner with Atraxa commander art */}
                  <div className="mb-3 relative rounded-lg overflow-hidden border-2 border-neutral-700">
                    <img
                      src="https://cards.scryfall.io/art_crop/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg"
                      alt="Atraxa, Praetors' Voice"
                      className="w-full h-24 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                    <div className="absolute bottom-2 left-3">
                      <div className="font-semibold text-xs text-white drop-shadow-lg">Sample Competitive Deck</div>
                      <div className="text-[10px] text-neutral-200 drop-shadow-lg">Atraxa, Praetors' Voice</div>
                    </div>
                  </div>
                  
                  {/* Mock summary with action buttons */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 mb-3">
                    <div className="text-xs font-semibold mb-2">Summary</div>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
                        <div className="opacity-70 text-[9px] mb-0.5">Cards over threshold</div>
                        <div className="font-bold text-sm">5</div>
                      </div>
                      <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
                        <div className="opacity-70 text-[9px] mb-0.5">Estimated savings</div>
                        <div className="font-bold text-sm text-emerald-400">£2,456.20</div>
                      </div>
                      <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
                        <div className="opacity-70 text-[9px] mb-0.5">Budget check</div>
                        <div className="text-[9px] text-amber-400">⚠️ Some above threshold</div>
                      </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-800">
                      <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-emerald-600 text-white font-medium">
                        <span>📊</span> Export CSV
                      </button>
                      <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-neutral-800 text-white border border-neutral-700">
                        Export → Moxfield <span className="ml-0.5 px-1 rounded bg-amber-300 text-black text-[8px] font-bold">PRO</span>
                      </button>
                      <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-neutral-800 text-white border border-neutral-700">
                        Export → MTGO <span className="ml-0.5 px-1 rounded bg-amber-300 text-black text-[8px] font-bold">PRO</span>
                      </button>
                      <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-sky-600 text-white font-medium">
                        <span>+</span> Add to Wishlist
                      </button>
                      <button className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-purple-600 text-white font-medium">
                        Fork deck <span className="ml-0.5 px-1 rounded bg-amber-300 text-black text-[8px] font-bold">PRO</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* Mock swap cards with images */}
                  <div className="space-y-2">
                    {[
                      { from: "Gaea's Cradle", fromPrice: 774.59, fromImg: 'https://cards.scryfall.io/small/front/2/5/25b0b816-0583-44aa-9dc5-f3ff48993a51.jpg', to: 'Growing Rites of Itlimoc', toPrice: 3.46, toImg: 'https://cards.scryfall.io/small/front/b/3/b3b87bfc-ed66-4e3c-aa24-27e19e1a37d8.jpg' },
                      { from: 'Chrome Mox', fromPrice: 86.05, fromImg: 'https://cards.scryfall.io/small/front/f/3/f340cbf7-5bbe-45b9-a4bf-d1caa500ff93.jpg', to: 'Arcane Signet', toPrice: 0.34, toImg: 'https://cards.scryfall.io/small/front/1/4/1486170d-4ad3-4318-bf72-f948617d567f.jpg' }
                    ].map((swap, i) => (
                      <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-950 p-2 hover:bg-neutral-900/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="w-3 h-3" />
                          
                          {/* FROM */}
                          <div className="flex items-start gap-2 flex-1 border-l-4 border-red-500 pl-2 py-1">
                            <img src={swap.fromImg} alt={swap.from} className="w-8 h-11 object-cover rounded" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] uppercase text-red-400 font-semibold mb-0.5">Remove</div>
                              <div className="text-xs font-medium truncate">{swap.from}</div>
                              <div className="text-[10px] text-red-400">£{swap.fromPrice}</div>
                            </div>
                          </div>
                          
                          {/* Arrow */}
                          <div className="text-lg text-neutral-500">→</div>
                          
                          {/* TO */}
                          <div className="flex items-start gap-2 flex-1 border-l-4 border-green-500 pl-2 py-1">
                            <img src={swap.toImg} alt={swap.to} className="w-8 h-11 object-cover rounded" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] uppercase text-green-400 font-semibold mb-0.5">Add</div>
                              <div className="text-xs font-medium truncate">{swap.to}</div>
                              <div className="text-[10px] text-green-400">£{swap.toPrice}</div>
                            </div>
                          </div>
                          
                          {/* Savings */}
                          <div className="text-xs font-bold text-emerald-400 shrink-0">
                            Save £{(swap.fromPrice - swap.toPrice).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-3 pt-2 border-t border-neutral-700 text-xs opacity-70 text-center">💡 Paste your own deck above to find real budget alternatives!</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary card with mana-colored glows */}
              <div className="rounded-xl border border-neutral-800 p-3">
                <div className="text-sm font-semibold">Summary</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 text-sm">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                  >
                    <div className="opacity-70 text-xs">Cards over threshold</div>
                    <div className="text-xl font-semibold">{sugs.length}</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, scale: [1, 1.02, 1] }}
                    transition={{ delay: 0.2, scale: { duration: 2, repeat: Infinity } }}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                    style={{
                      boxShadow: savings > 50 
                        ? `0 0 20px ${getManaGlow('green')}40` 
                        : savings > 20 
                        ? `0 0 20px rgba(251, 191, 36, 0.3)` 
                        : `0 0 20px ${getManaGlow('red')}40`
                    }}
                  >
                    <div className="opacity-70 text-xs">Estimated savings</div>
                    <div className="text-xl font-semibold text-emerald-400">{fmt(savings)}</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                  >
                    <div className="opacity-70 text-xs">Budget check</div>
                    <div className={`text-sm font-semibold ${withinBudget? 'text-emerald-400':'text-amber-400'}`}>{withinBudget? `✅ Within your ${new Intl.NumberFormat(undefined,{style:'currency', currency}).format(threshold)} budget!` : '⚠️ Some staples remain above threshold.'}</div>
                  </motion.div>
                </div>
              </div>

              {/* Quick actions grouped at bottom of summary - matching Cost to Finish styling */}
              <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={exportCSV} className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium">
                    <span>📊</span> Export CSV
                  </button>
                  <button onClick={()=>exportTxt('moxfield')} className="flex items-center gap-1 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700">
                    Export → Moxfield <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold uppercase">Pro</span>
                  </button>
                  <button onClick={()=>exportTxt('mtgo')} className="flex items-center gap-1 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700">
                    Export → MTGO <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-bold uppercase">Pro</span>
                  </button>
                  <button onClick={addToWishlist} className="flex items-center gap-1 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium">
                    <span>+</span> Add swaps to Wishlist
                  </button>
                  <button onClick={forkDeck} className="flex items-center gap-1 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium">
                    Fork deck with swaps <span className="ml-1 px-1 py-0.5 rounded bg-amber-300 text-black text-[10px] font-bold">PRO</span>
                  </button>
                </div>
              </div>

              {/* Divider to separate summary from swaps */}
              <div className="my-4 border-t border-neutral-800" />

              {/* Card-based swap grid with checkboxes */}
              <div className="space-y-3">
                {sugs.map((s, idx) => {
                  const mFrom = meta[s.from.toLowerCase()] || {};
                  const mTo = meta[s.to.toLowerCase()] || {};
                  const diff = (s.price_to||0) - (s.price_from||0);
                  const good = diff < 0;
                  const savings = Math.abs(diff);
                  return (
                    <motion.div
                      key={`s-${idx}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05, duration: 0.3 }}
                      className={`relative rounded-xl border ${selectedSwaps.has(idx) ? 'border-purple-500 bg-purple-950/20' : 'border-neutral-800 bg-neutral-950'} p-4 hover:shadow-lg hover:border-neutral-700 transition-all`}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedSwaps.has(idx)}
                        onChange={() => toggleSelection(idx)}
                        className="absolute top-3 left-3 w-4 h-4 rounded border-neutral-600 text-purple-600 focus:ring-purple-500 focus:ring-2 cursor-pointer z-10"
                      />

                      {/* Savings badge - prevent overflow on mobile with better positioning */}
                      <div className={`absolute top-3 right-3 px-2 py-1 rounded text-xs font-semibold whitespace-nowrap z-10 ${good ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                        <span className="hidden sm:inline">{good ? 'Save ' : '+'}</span>
                        <span className="sm:hidden">{good ? 'S' : '+'}</span>
                        <span>{fmt(savings)}</span>
                      </div>

                      {/* Card layout: FROM → TO - add padding on mobile to prevent badge overlap */}
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mt-6 pr-20 sm:pr-0">
                        {/* FROM card - truncate long names on mobile */}
                        <div className="border-l-4 border-red-500 pl-3 pr-2 py-2 rounded bg-red-950/10 min-w-0">
                          <div className="text-[10px] uppercase tracking-wide text-red-400 mb-1 font-semibold">Remove</div>
                          <div className="flex items-center gap-1 min-w-0">
                            <CardRowPreviewLeft name={s.from} imageSmall={mFrom.small} imageLarge={mFrom.large} setCode={mFrom.set} rarity={mFrom.rarity} />
                          </div>
                          <div className="text-xs text-red-400 mt-1 truncate">{fmt(s.price_from)}</div>
                        </div>

                        {/* Arrow + Why button */}
                        <div className="flex flex-col items-center gap-2">
                          <div className="text-3xl text-neutral-500">→</div>
                          <button
                            className="inline-flex items-center px-2 py-1 rounded bg-amber-400 hover:bg-amber-300 text-black font-semibold text-[10px] transition-colors"
                            onClick={async ()=>{
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
                            }}
                          >
                            {whyBusy[`${s.from}→${s.to}`] ? '…' : 'Why?'}
                          </button>
                        </div>

                        {/* TO card - truncate long names on mobile */}
                        <div className="border-l-4 border-green-500 pl-3 pr-2 py-2 rounded bg-green-950/10 min-w-0">
                          <div className="text-[10px] uppercase tracking-wide text-green-400 mb-1 font-semibold">Add</div>
                          <div className="flex items-center gap-1 min-w-0">
                            <CardRowPreviewLeft name={s.to} imageSmall={mTo.small} imageLarge={mTo.large} setCode={mTo.set} rarity={mTo.rarity} />
                          </div>
                          <div className="text-xs text-green-400 mt-1 truncate">{fmt(s.price_to)}</div>
                        </div>
                      </div>

                      {/* Why explanation (if present) */}
                      {whyMap[`${s.from}→${s.to}`] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 pt-3 border-t border-neutral-700 text-xs text-neutral-300"
                        >
                          {whyMap[`${s.from}→${s.to}`]}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
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

      {/* Floating batch action bar */}
      <AnimatePresence>
        {selectedSwaps.size > 0 && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: "spring", damping: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 border-2 border-purple-500 rounded-lg px-6 py-3 shadow-2xl flex items-center gap-4 z-50"
            style={{ boxShadow: `0 10px 40px ${getManaGlow('blue')}60` }}
          >
            <span className="font-semibold text-sm">
              {selectedSwaps.size} swap{selectedSwaps.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
            >
              Clear
            </button>
            <button
              onClick={applySwapsToDeck}
              className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition-colors flex items-center gap-2"
            >
              Apply to Deck
              {!isProFinal && <span className="px-1.5 rounded bg-amber-400 text-black text-[10px]">Pro</span>}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setShowSuccessModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-neutral-900 border-2 border-emerald-500 rounded-xl p-6 max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="text-5xl mb-3">✨</div>
                <h3 className="text-xl font-bold mb-2 text-emerald-400">Deck Forked!</h3>
                <p className="text-sm text-neutral-300 mb-4">
                  Your new budget-optimized deck has been created successfully.
                </p>
                <div className="flex gap-3 justify-center">
                  <a
                    href={newDeckLink}
                    className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
                  >
                    View New Deck
                  </a>
                  <button
                    onClick={() => setShowSuccessModal(false)}
                    className="px-4 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <FixDeckNamesModal
        open={fixNamesOpen}
        onClose={() => setFixNamesOpen(false)}
        items={fixNamesItems}
        onApply={(choices) => {
          // Update deckText with corrected names
          fetch('/api/deck/parse-and-fix-names', {
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
              setTimeout(() => compute(), 100);
            }
          }).catch(() => {});
        }}
      />

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
