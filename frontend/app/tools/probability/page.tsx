"use client";
import React from "react";
import ImportDeckForMath from "@/components/ImportDeckForMath";
import FixDeckNamesModal from "@/components/FixDeckNamesModal";
import { motion, AnimatePresence } from "framer-motion";
import { getManaGlow } from "@/lib/mana-colors";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { comb, hypergeomCDFAtLeast, buildProbabilityNarrative } from "@/lib/math/hypergeometric";

export default function ProbabilityHelpersPage() {
  const [deckSize, setDeckSize] = React.useState(99);
  const [successCards, setSuccessCards] = React.useState(10);
  const [openingHand, setOpeningHand] = React.useState(7);
  const [turns, setTurns] = React.useState(4);
  const [atLeast, setAtLeast] = React.useState(1);
  const [advanced, setAdvanced] = React.useState(false);

  // Play/draw + extra draws per turn
  const [onDraw, setOnDraw] = React.useState(false);
  const [extraPerTurn, setExtraPerTurn] = React.useState(0); // cantrip per turn, etc.

  // Copy button states
  const [copiedSummary, setCopiedSummary] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);
  
  // Explanation toggle
  const [showExplanation, setShowExplanation] = React.useState(false);
  
  // Deck selection & commander art
  const [selectedDeckId, setSelectedDeckId] = React.useState<string | null>(null);
  const [commanderArt, setCommanderArt] = React.useState<string | null>(null);
  
  // Deck text paste & name fixing
  const [deckText, setDeckText] = React.useState("");
  const [fixNamesOpen, setFixNamesOpen] = React.useState(false);
  const [fixNamesItems, setFixNamesItems] = React.useState<Array<{ originalName: string; qty: number; suggestions: string[] }>>([]);
  const [parsedCards, setParsedCards] = React.useState<Array<{ name: string; qty: number }>>([]);

  // K-chips counts (user editable quick-picks)
  const [kLands, setKLands] = React.useState(35);
  const [kRamp, setKRamp] = React.useState(10);
  const [kDraw, setKDraw] = React.useState(8);
  const [kRemoval, setKRemoval] = React.useState(10);

  // Color requirement solver inputs
  const [srcW, setSrcW] = React.useState(10);
  const [srcU, setSrcU] = React.useState(10);
  const [srcB, setSrcB] = React.useState(10);
  const [srcR, setSrcR] = React.useState(10);
  const [srcG, setSrcG] = React.useState(10);
  const [reqW, setReqW] = React.useState(0);
  const [reqU, setReqU] = React.useState(0);
  const [reqB, setReqB] = React.useState(0);
  const [reqR, setReqR] = React.useState(0);
  const [reqG, setReqG] = React.useState(0);
  const [reqTurn, setReqTurn] = React.useState(2);

  // Load from localStorage or query params on mount
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const apply = (k: string, setter: (n:number)=>void) => {
        const v = params.get(k);
        if (v != null) { const n = parseInt(v, 10); if (Number.isFinite(n)) setter(n); }
      };
      const ls = (k: string, setter: (n:number)=>void) => {
        const v = localStorage.getItem('prob:'+k); if (v != null) { const n = parseInt(v, 10); if (Number.isFinite(n)) setter(n); }
      };
      apply('N', setDeckSize); apply('K', setSuccessCards); apply('H', setOpeningHand); apply('T', setTurns); apply('k', setAtLeast);
      ls('N', setDeckSize); ls('K', setSuccessCards); ls('H', setOpeningHand); ls('T', setTurns); ls('k', setAtLeast);
      // Advanced toggle
      const adv = localStorage.getItem('prob:adv'); if (adv!=null) setAdvanced(adv==='1');
      // Toggles
      const drawQ = params.get('draw'); if (drawQ!=null) setOnDraw(drawQ==='1'); else { const d=localStorage.getItem('prob:draw'); if (d!=null) setOnDraw(d==='1'); }
      const xptQ = params.get('xpt'); if (xptQ!=null && !isNaN(parseInt(xptQ,10))) setExtraPerTurn(parseInt(xptQ,10)); else { const x=localStorage.getItem('prob:xpt'); if (x!=null) setExtraPerTurn(parseInt(x,10)); }
      // Color params
      ['w','u','b','r','g'].forEach((k,idx)=>{ const v=params.get(k); if(v!=null){ const n=parseInt(v,10); if(Number.isFinite(n)){ [setSrcW,setSrcU,setSrcB,setSrcR,setSrcG][idx](n);} } else { const lsV=localStorage.getItem('prob:'+k); if(lsV!=null){ const n=parseInt(lsV,10); if(Number.isFinite(n)){ [setSrcW,setSrcU,setSrcB,setSrcR,setSrcG][idx](n);} } }});
      ;(['rw','ru','rb','rr','rg'] as const).forEach((k,idx)=>{ const v=params.get(k); if(v!=null){ const n=parseInt(v,10); if(Number.isFinite(n)){ [setReqW,setReqU,setReqB,setReqR][idx] ? [setReqW,setReqU,setReqB,setReqR,setReqG][idx](n) : setReqG(n); } } else { const lsV=localStorage.getItem('prob:'+k); if(lsV!=null){ const n=parseInt(lsV,10); if(Number.isFinite(n)){ [setReqW,setReqU,setReqB,setReqR][idx] ? [setReqW,setReqU,setReqB,setReqR,setReqG][idx](n) : setReqG(n); } } }});
      const rtQ=params.get('rt'); if(rtQ!=null){ const n=parseInt(rtQ,10); if(Number.isFinite(n)) setReqTurn(n);} else { const lsrt=localStorage.getItem('prob:rt'); if(lsrt!=null){ const n=parseInt(lsrt,10); if(Number.isFinite(n)) setReqTurn(n);} }
    } catch {}
  }, []);

  React.useEffect(()=>{ try{ localStorage.setItem('prob:adv', advanced ? '1':'0'); } catch{} }, [advanced]);

  // Fetch commander art when deck is selected
  React.useEffect(() => {
    (async () => {
      if (!selectedDeckId) { setCommanderArt(null); return; }
      
      try {
        const sb = createBrowserSupabaseClient();
        const { data: deck } = await sb
          .from('decks')
          .select('commander')
          .eq('id', selectedDeckId)
          .maybeSingle();
        
        if (!deck?.commander) { setCommanderArt(null); return; }
        
        // Normalize commander name like price tracker does
        const normalized = deck.commander.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
        
        // Fetch commander art from scryfall_cache
        const { data } = await sb
          .from('scryfall_cache')
          .select('art_crop')
          .ilike('name', normalized)
          .limit(1)
          .maybeSingle();
        
        if (data?.art_crop) {
          setCommanderArt(data.art_crop);
        } else {
          setCommanderArt(null);
        }
      } catch (err) {
        console.error('Failed to fetch commander art:', err);
        setCommanderArt(null);
      }
    })();
  }, [selectedDeckId]);

  // Persist + update URL
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(); params.set('N', String(deckSize)); params.set('K', String(successCards)); params.set('H', String(openingHand)); params.set('T', String(turns)); params.set('k', String(atLeast)); params.set('draw', onDraw? '1':'0'); params.set('xpt', String(extraPerTurn));
      // Color solver params
      params.set('w', String(srcW)); params.set('u', String(srcU)); params.set('b', String(srcB)); params.set('r', String(srcR)); params.set('g', String(srcG));
      params.set('rw', String(reqW)); params.set('ru', String(reqU)); params.set('rb', String(reqB)); params.set('rr', String(reqR)); params.set('rg', String(reqG)); params.set('rt', String(reqTurn));
      const url = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', url);
      localStorage.setItem('prob:N', String(deckSize));
      localStorage.setItem('prob:K', String(successCards));
      localStorage.setItem('prob:H', String(openingHand));
      localStorage.setItem('prob:T', String(turns));
      localStorage.setItem('prob:k', String(atLeast));
      localStorage.setItem('prob:draw', onDraw?'1':'0');
      localStorage.setItem('prob:xpt', String(extraPerTurn));
      localStorage.setItem('prob:w', String(srcW)); localStorage.setItem('prob:u', String(srcU)); localStorage.setItem('prob:b', String(srcB)); localStorage.setItem('prob:r', String(srcR)); localStorage.setItem('prob:g', String(srcG));
      localStorage.setItem('prob:rw', String(reqW)); localStorage.setItem('prob:ru', String(reqU)); localStorage.setItem('prob:rb', String(reqB)); localStorage.setItem('prob:rr', String(reqR)); localStorage.setItem('prob:rg', String(reqG)); localStorage.setItem('prob:rt', String(reqTurn));
    } catch {}
  }, [deckSize, successCards, openingHand, turns, atLeast, onDraw, extraPerTurn, srcW, srcU, srcB, srcR, srcG, reqW, reqU, reqB, reqR, reqG, reqTurn]);

  const draws = Math.max(0, openingHand) + Math.max(0, Math.floor(turns)) + (onDraw ? 1 : 0) + (Math.max(0, extraPerTurn) * Math.max(0, Math.floor(turns)));
  const p = hypergeomCDFAtLeast(atLeast, successCards, deckSize, draws);
  const narrative = buildProbabilityNarrative({
    deckSize,
    successes: successCards,
    draws,
    atLeast,
    openingHand,
    turns,
  });

  const pKminus = hypergeomCDFAtLeast(Math.max(0, atLeast), Math.max(0, successCards-1), deckSize, draws);
  const pKplus = hypergeomCDFAtLeast(Math.max(0, atLeast), successCards+1, deckSize, draws);

  // Per-turn curve (up to 8 turns or the chosen 'turns')
  const perTurn = (() => {
    const maxT = Math.min(8, Math.max(1, turns));
    const arr: Array<{ turn: number; p: number }> = [];
    for (let t = 0; t <= maxT; t++) {
      const d = Math.max(0, openingHand) + t;
      arr.push({ turn: t, p: hypergeomCDFAtLeast(atLeast, successCards, deckSize, d) });
    }
    return arr;
  })();

  const spark = (() => {
    const W = 240, H = 40, P = 2;
    if (perTurn.length <= 1) return { d: `M0 ${H-P}`, W, H };
    const xs = (i: number) => P + (i * (W - 2*P)) / (perTurn.length - 1);
    const ys = (p: number) => P + (H - 2*P) * (1 - p);
    let d = `M ${xs(0)} ${ys(perTurn[0].p)}`;
    for (let i = 1; i < perTurn.length; i++) d += ` L ${xs(i)} ${ys(perTurn[i].p)}`;
    const last = { x: xs(perTurn.length - 1), y: ys(perTurn[perTurn.length - 1].p) };
    return { d, W, H, last } as any;
  })();

  const copySummary = async () => {
    const text = `P(X≥${atLeast}) by end of turn ${turns} with N=${deckSize}, K=${successCards}, opening hand ${openingHand}: ${(p*100).toFixed(2)}%`;
    try {
      await navigator.clipboard?.writeText?.(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch (err) {
      alert('❌ Failed to copy');
    }
  };

  const presets = [
    { label: 'Commander: N=99, K=10, H=7, T=4, k=1', vals: { N:99,K:10,H:7,T:4,k:1 } },
    { label: 'Modern: N=60, K=8, H=7, T=3, k=1', vals: { N:60,K:8,H:7,T:3,k:1 } },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-blue-900/20 via-purple-900/10 to-pink-900/20 p-6"
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
          <div className="flex items-center gap-3 mb-2 justify-center md:justify-start">
            <motion.span
              className="text-4xl"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              🎲
            </motion.span>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
              Probability Calculator
            </h1>
          </div>
          <p className="text-base text-neutral-300 max-w-3xl leading-relaxed text-center md:text-left">
            What are the odds you'll draw your combo by turn five? Let's do the math — and the magic. ✨
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap justify-center md:justify-start">
            {[
              { icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z", text: "Hypergeometric Math", color: "text-blue-400" },
              { icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", text: "Import from Decks", color: "text-purple-400" },
              { icon: "M13 10V3L4 14h7v7l9-11h-7z", text: "Per-Turn Analysis", color: "text-pink-400" }
            ].map((badge, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                className={`flex items-center gap-1.5 ${badge.color}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={badge.icon} />
                </svg>
                <span>{badge.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.header>
      {advanced && (
        <div className="sticky top-2 z-20 bg-neutral-900/80 backdrop-blur border border-neutral-800 rounded px-3 py-2 flex items-center justify-between">
          <div className="text-xs opacity-80">Advanced options open</div>
          <button onClick={()=>setAdvanced(false)} className="text-xs border rounded px-2 py-1">Hide advanced</button>
        </div>
      )}

      {/* Import from My Decks */}
      <ImportDeckForMath
        storageKey="prob"
        onApply={({ deckId, deckSize: N, successCards: K }: any) => {
          setDeckSize(N || deckSize);
          if (K && Number.isFinite(K)) setSuccessCards(K);
          setSelectedDeckId(deckId || null);
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("deckId", deckId);
            window.history.replaceState({}, "", url.toString());
          } catch {}
          (async()=>{ try{ const res = await autoFillColorSources(deckId); if (res) { const { W,U,B,R,G } = res; setSrcW(Number(W)||0); setSrcU(Number(U)||0); setSrcB(Number(B)||0); setSrcR(Number(R)||0); setSrcG(Number(G)||0); } } catch{} })();
        }}
      />

      {/* Paste Your Decklist */}
      <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-3">
        <div className="text-sm font-semibold">Paste Your Decklist</div>
        <textarea
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
          placeholder="Paste your decklist here (e.g., '1 Sol Ring', '36 Forest', etc.)"
          className="w-full h-32 bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-sm font-mono resize-none"
        />
        <p className="text-xs text-neutral-500">
          Pick a deck to auto-fill N. Add a match term or select cards to set K.
        </p>
        <p className="text-xs text-neutral-500">
          Sign in to import from your decks. You can still paste a list manually.
        </p>
        <button
          onClick={async () => {
            if (!deckText.trim()) return;
            try {
              const r = await fetch('/api/deck/parse-and-fix-names', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deckText }),
              });
              const j = await r.json().catch(() => ({}));
              if (!r.ok || !j?.ok) {
                alert(j?.error || 'Failed to parse deck');
                return;
              }
              if (j.items && j.items.length > 0) {
                setFixNamesItems(j.items);
                setFixNamesOpen(true);
                setParsedCards(j.cards || []);
              } else {
                // All names are good, use the parsed cards
                setParsedCards(j.cards || []);
                // Auto-set deck size from parsed cards
                const total = (j.cards || []).reduce((sum: number, c: any) => sum + (c.qty || 0), 0);
                if (total > 0) setDeckSize(total);
              }
            } catch (e: any) {
              alert(e?.message || 'Failed to parse deck');
            }
          }}
          disabled={!deckText.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          Parse & Check Names
        </button>
      </div>
      
      <FixDeckNamesModal
        open={fixNamesOpen}
        onClose={() => setFixNamesOpen(false)}
        items={fixNamesItems}
        onApply={(choices) => {
          // Update parsed cards with user choices
          const updated = parsedCards.map(c => {
            // Find if this card was in the fix items
            const item = fixNamesItems.find(it => it.originalName === c.name);
            if (item && choices[item.originalName]) {
              return { ...c, name: choices[item.originalName] };
            }
            return c;
          });
          setParsedCards(updated);
          // Auto-set deck size
          const total = updated.reduce((sum, c) => sum + (c.qty || 0), 0);
          if (total > 0) setDeckSize(total);
        }}
      />

      {/* 3-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* LEFT COLUMN: Inputs */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-3">
            <label className="text-sm block">
              <div className="opacity-70 mb-1 text-xs">Deck size (N)</div>
              <input
                type="number"
                className="w-full bg-neutral-950/60 backdrop-blur-sm border border-neutral-700 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-neutral-950/80 focus:shadow-[0_0_15px_rgba(96,165,250,0.3)] transition-all text-sm"
                value={deckSize}
                onChange={e=>setDeckSize(parseInt(e.target.value||"0",10))}
              />
            </label>
            <label className="text-sm block">
              <div className="opacity-70 mb-1 text-xs">Desired cards (K)</div>
              <input
                type="number"
                className="w-full bg-neutral-950/60 backdrop-blur-sm border border-neutral-700 rounded px-2 py-1.5 focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-neutral-950/80 focus:shadow-[0_0_15px_rgba(192,132,252,0.3)] transition-all text-sm"
                value={successCards}
                onChange={e=>setSuccessCards(parseInt(e.target.value||"0",10))}
              />
            </label>
            <label className="text-sm block">
              <div className="opacity-70 mb-1 text-xs">Opening hand</div>
              <input
                type="number"
                className="w-full bg-neutral-950/60 backdrop-blur-sm border border-neutral-700 rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:bg-neutral-950/80 focus:shadow-[0_0_15px_rgba(96,165,250,0.3)] transition-all text-sm"
                value={openingHand}
                onChange={e=>setOpeningHand(parseInt(e.target.value||"0",10))}
              />
            </label>
            <label className="text-sm block">
              <div className="opacity-70 mb-1 text-xs">Turns to draw</div>
              <input
                type="number"
                className="w-full bg-neutral-950/60 backdrop-blur-sm border border-neutral-700 rounded px-2 py-1.5 focus:ring-2 focus:ring-purple-400 focus:border-purple-400 focus:bg-neutral-950/80 focus:shadow-[0_0_15px_rgba(192,132,252,0.3)] transition-all text-sm"
                value={turns}
                onChange={e=>setTurns(parseInt(e.target.value||"0",10))}
              />
            </label>
            <label className="text-sm block">
              <div className="opacity-70 mb-1 text-xs">At least (k)</div>
              <input
                type="number"
                className="w-full bg-neutral-950/60 backdrop-blur-sm border border-neutral-700 rounded px-2 py-1.5 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 focus:bg-neutral-950/80 focus:shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all text-sm"
                value={atLeast}
                onChange={e=>setAtLeast(parseInt(e.target.value||"0",10))}
              />
            </label>
            <div className="text-xs opacity-70 pt-1">
              Draws by turn {turns}: <span className="font-mono font-semibold">{draws}</span>
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN: Main Result */}
        <div className="lg:col-span-6 space-y-3">
          {/* Commander art banner */}
          {commanderArt && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="mb-3 relative rounded-lg overflow-hidden border-2 border-neutral-700"
            >
              <img
                src={commanderArt}
                alt="Commander"
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            </motion.div>
          )}

          <motion.div
        key={`${p}-${successCards}`}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
        className="bg-neutral-900 border border-neutral-800 rounded p-4"
      >
        <div className="text-sm opacity-70 mb-1">Draws by end of turn: <span className="font-mono font-semibold">{draws}</span></div>
        <motion.div
          className="relative text-5xl font-bold font-mono mb-1"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {/* Sparkline background */}
          <svg
            className="absolute inset-0 w-full h-full opacity-10 pointer-events-none"
            viewBox="0 0 200 80"
            preserveAspectRatio="none"
          >
            <path
              d={(() => {
                const points = perTurn.map((pt, i) => {
                  const x = (i / (perTurn.length - 1)) * 200;
                  const y = 80 - (pt.p * 70);
                  return `${x},${y}`;
                }).join(' L ');
                return `M ${points}`;
              })()}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-blue-400"
            />
          </svg>
          
          <span
            className="relative z-10 text-transparent bg-clip-text"
            style={{
              backgroundImage: p >= 0.7 ? 'linear-gradient(to right, #10b981, #34d399)' :
                               p >= 0.4 ? 'linear-gradient(to right, #fbbf24, #fcd34d)' :
                               'linear-gradient(to right, #ef4444, #f87171)'
            }}
          >
            {(p*100).toFixed(1)}%
          </span>
        </motion.div>
        <div className="text-xs opacity-60 mb-2">Hypergeometric distribution (draws without replacement)</div>
        
        {/* Collapsible Explanation */}
        <div className="mb-3">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="text-xs text-blue-400 hover:text-blue-300 underline decoration-dotted"
          >
            {showExplanation ? '▼ Hide explanation' : '▶ Show explanation'}
          </button>
          <AnimatePresence>
            {showExplanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-3 p-3 rounded-lg bg-blue-950/20 border border-blue-800/30 text-xs space-y-2"
              >
                <p className="leading-relaxed">
                  This uses the <strong>hypergeometric distribution</strong>, which estimates the chance of seeing at least <strong>k</strong> cards drawn from <strong>n</strong> without replacement. In plain English: <em>shuffling once, no cheating.</em> 🎴
                </p>
                
                {/* Visual card drawing animation */}
                <div className="flex items-center gap-2 justify-center py-2">
                  <div className="flex gap-1">
                    {[...Array(7)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0, rotate: -45 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        transition={{ delay: i * 0.1, type: "spring", stiffness: 300 }}
                        className="w-6 h-8 rounded-sm bg-gradient-to-br from-blue-500/60 to-purple-500/60 border border-blue-400/40 flex items-center justify-center text-[10px]"
                      >
                        {i < atLeast ? '✓' : '·'}
                      </motion.div>
                    ))}
                  </div>
                  <span className="text-neutral-400">← Your draw</span>
                </div>
                
                <div className="text-[11px] opacity-70 pt-1 border-t border-blue-800/20">
                  <strong>Formula:</strong> P(X ≥ k) = Σ [C(K,i) × C(N-K, n-i)] / C(N,n) for i from k to min(n,K)
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-xs leading-relaxed space-y-1 bg-neutral-900/80 border border-neutral-800 rounded p-3">
          {narrative.lines.map((line, idx) => (
            <p key={idx}>{line}</p>
          ))}
        </div>

        {/* Comparison View */}
        {advanced && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {([
              { label: 'K-1', K: successCards - 1, prob: pKminus, color: 'black' as const },
              { label: 'Current', K: successCards, prob: p, color: 'blue' as const },
              { label: 'K+1', K: successCards + 1, prob: pKplus, color: 'green' as const }
            ]).map((scenario, i) => {
              const delta = scenario.prob - p;
              return (
                <motion.div
                  key={scenario.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                  className="relative rounded-lg border border-neutral-700 p-2 text-center"
                  style={{
                    background: `linear-gradient(135deg, ${getManaGlow(scenario.color)}15, transparent)`,
                    borderColor: scenario.label === 'Current' ? getManaGlow(scenario.color) + '80' : undefined
                  }}
                >
                  <div className="text-[10px] opacity-60 mb-1">{scenario.label}</div>
                  <div className="text-xs font-mono mb-1">K={scenario.K}</div>
                  <div className="text-lg font-bold font-mono">{(scenario.prob*100).toFixed(1)}%</div>
                  {scenario.label !== 'Current' && (
                    <div className={`text-[10px] font-mono ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {delta >= 0 ? '+' : ''}{(delta*100).toFixed(1)}%
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
        {/* Per-turn curve */}
        <div className="mt-2 flex flex-col gap-2">
          <svg width={spark.W} height={spark.H} className="block">
            <path d={spark.d} stroke="#10b981" strokeWidth="2" fill="none" />
            {spark.last && <circle cx={spark.last.x} cy={spark.last.y} r="2.5" fill="#10b981" />}
          </svg>
          <div className="text-xs overflow-auto">
            <table className="min-w-[280px]">
              <thead className="opacity-70">
                <tr>
                  {perTurn.map(pt => <th key={pt.turn} className="px-1 text-right font-normal">T{pt.turn}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {perTurn.map(pt => <td key={pt.turn} className="px-1 text-right font-mono">{(pt.p*100).toFixed(1)}%</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <motion.button
            onClick={async () => {
              try {
                const r = await fetch('/api/events/tools', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'prob_run' }) });
                if (r.status === 429) {
                  const j = await r.json().catch(() => ({}));
                  if (j?.proUpsell) {
                    const { showProToast } = await import('@/lib/pro-ux');
                    showProToast();
                  }
                  return;
                }
              } catch {}
            }}
            className="px-2 py-1 rounded text-xs bg-neutral-800 hover:bg-neutral-700 transition-colors"
          >
            Run
          </motion.button>
          <motion.button
            onClick={copySummary}
            animate={copiedSummary ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.3 }}
            className={`px-2 py-1 rounded text-xs transition-colors ${copiedSummary ? 'bg-emerald-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}
          >
            {copiedSummary ? '✓ Copied!' : 'Copy summary'}
          </motion.button>
          {advanced && (
            <>
          <motion.button
            onClick={async()=>{ 
              try{ 
                await navigator.clipboard?.writeText?.(window.location.href); 
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
                fetch('/api/events/tools',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'prob_save'})}); 
              } catch{ 
                alert('❌ Failed to copy link'); 
              } 
            }}
            animate={copiedLink ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.3 }}
            className={`px-2 py-1 rounded text-xs transition-colors ${copiedLink ? 'bg-emerald-600 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}
          >
            {copiedLink ? '✓ Copied!' : 'Copy link'}
          </motion.button>
              <div className="flex flex-wrap gap-2 text-xs">
                {presets.map(pr => (
                  <button key={pr.label} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={() => { setDeckSize(pr.vals.N as any); setSuccessCards(pr.vals.K as any); setOpeningHand(pr.vals.H as any); setTurns(pr.vals.T as any); setAtLeast(pr.vals.k as any); }}>{pr.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
        </div>

        {/* RIGHT COLUMN: Quick Actions */}
        <div className="lg:col-span-3 space-y-3">
          {/* Quick Preset Cards */}
          <div className="bg-neutral-900 border border-neutral-800 rounded p-4">
            <div className="text-sm font-medium mb-3">Quick Presets</div>
            <div className="space-y-2">
              {[
                {label:'Lands', icon:'🏔️', val:kLands, set:setKLands, color:'green'},
                {label:'Ramp', icon:'⚡', val:kRamp, set:setKRamp, color:'white'},
                {label:'Draw', icon:'📖', val:kDraw, set:setKDraw, color:'blue'},
                {label:'Removal', icon:'💥', val:kRemoval, set:setKRemoval, color:'red'},
              ].map((c:any)=> (
                <motion.button
                  key={c.label}
                  whileHover={{ scale: 1.02, x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={()=>setSuccessCards(c.val)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-700 bg-neutral-950 hover:border-neutral-600 transition-colors text-left"
                  style={{ boxShadow: `0 0 15px -8px ${getManaGlow(c.color)}` }}
                >
                  <div className="text-2xl">{c.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-xs opacity-60">Set K = {c.val}</div>
                  </div>
                  <div className="text-xs font-mono bg-neutral-800 px-2 py-1 rounded">{c.val}</div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Advanced Options */}
          <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-3">
            <div className="text-sm font-medium">Options</div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={onDraw} onChange={e=>setOnDraw(e.target.checked)} className="rounded" />
              <span>On the draw</span>
            </label>
            <label className="text-sm block">
              <div className="opacity-70 mb-1 text-xs">Extra draws/turn</div>
              <input
                type="number"
                min={0}
                step={1}
                value={extraPerTurn}
                onChange={e=>setExtraPerTurn(Math.max(0, parseInt(e.target.value||'0',10)))}
                className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </label>
            <button
              onClick={()=>setAdvanced(a=>!a)}
              className="w-full px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
            >
              {advanced ? '🎨 Hide Color Solver' : '🎨 Show Color Solver'}
            </button>
          </div>
        </div>
      </div>

      {/* Color Requirement Solver (Full Width Below) */}
      {advanced && (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2"
      >
        <div className="font-medium flex items-center gap-2">
          🎨 Color Requirement Solver
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-sm opacity-80">Color sources in deck <span className="text-xs opacity-60">(Detected: W {srcW} • U {srcU} • B {srcB} • R {srcR} • G {srcG})</span></div>
            <div className="grid grid-cols-5 gap-2">
              {[
                {l:'W',v:srcW,set:setSrcW,emoji:'⚪',color:'#F0E68C'},
                {l:'U',v:srcU,set:setSrcU,emoji:'🔵',color:'#0E68AB'},
                {l:'B',v:srcB,set:setSrcB,emoji:'⚫',color:'#150B00'},
                {l:'R',v:srcR,set:setSrcR,emoji:'🔴',color:'#D3202A'},
                {l:'G',v:srcG,set:setSrcG,emoji:'🟢',color:'#00733E'},
              ].map(c=> (
                <label key={c.l} className="text-xs">
                  <div className="opacity-70 mb-1 flex items-center gap-0.5">
                    <span>{c.emoji}</span>
                    <span>{c.l}</span>
                  </div>
                  <input
                    type="number"
                    value={c.v}
                    onChange={e=>c.set(parseInt(e.target.value||'0',10))}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 focus:ring-2 transition-all"
                    style={{ '--tw-ring-color': c.color + '50' } as any}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm opacity-80">Need by turn</div>
            <div className="grid grid-cols-6 gap-2 items-end">
              {[
                {l:'W',v:reqW,set:setReqW,emoji:'⚪',color:'#F0E68C'},
                {l:'U',v:reqU,set:setReqU,emoji:'🔵',color:'#0E68AB'},
                {l:'B',v:reqB,set:setReqB,emoji:'⚫',color:'#150B00'},
                {l:'R',v:reqR,set:setReqR,emoji:'🔴',color:'#D3202A'},
                {l:'G',v:reqG,set:setReqG,emoji:'🟢',color:'#00733E'},
              ].map(c=> (
                <label key={c.l} className="text-xs">
                  <div className="opacity-70 mb-1 flex items-center gap-0.5">
                    <span>{c.emoji}</span>
                    <span>{c.l}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={c.v}
                    onChange={e=>c.set(parseInt(e.target.value||'0',10))}
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 focus:ring-2 transition-all"
                    style={{ '--tw-ring-color': c.color + '50' } as any}
                  />
                </label>
              ))}
              <label className="text-xs">
                <div className="opacity-70 mb-1">Turn</div>
                <input type="number" min={1} max={6} value={reqTurn} onChange={e=>setReqTurn(parseInt(e.target.value||'1',10))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
              </label>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={async()=>{ const d=new URLSearchParams(window.location.search).get('deckId')||''; if(!d) return; try{ const res = await autoFillColorSources(d); if (res) { const { W,U,B,R,G } = res; setSrcW(Number(W)||0); setSrcU(Number(U)||0); setSrcB(Number(B)||0); setSrcR(Number(R)||0); setSrcG(Number(G)||0); } } catch{} }}>Use deck color sources</button>
        </div>
        <ColorRequirementResult deckSize={deckSize} openingHand={openingHand} onDraw={onDraw} extraPerTurn={extraPerTurn} src={{W:srcW,U:srcU,B:srcB,R:srcR,G:srcG}} req={{W:reqW,U:reqU,B:reqB,R:reqR,G:reqG}} turn={reqTurn} />
      </motion.div>
      )}

      <div className="text-xs opacity-60">How to read this: we use the hypergeometric distribution (drawing without replacement) to estimate the probability of seeing at least k copies in your draws. Assumptions: independent shuffles, one or more cards drawn per turn as configured.</div>
    </div>
  );
}

async function autoFillColorSources(deckId: string){
  if (!deckId) return null as null | { W:number; U:number; B:number; R:number; G:number };
  try {
    const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
    const j = await r.json().catch(()=>({ ok:false }));
    if (!r.ok || j?.ok===false) return null;
    const rows: Array<{ name:string; qty:number }> = Array.isArray(j.cards)? j.cards:[];
    const s = await fetch('/api/deck/color-sources', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ cards: rows }) });
    const sj = await s.json().catch(()=>({ ok:false }));
    if (s.ok && sj?.ok) {
      const { W=0,U=0,B=0,R=0,G=0 } = sj.sources || {};
      return { W:Number(W)||0, U:Number(U)||0, B:Number(B)||0, R:Number(R)||0, G:Number(G)||0 };
    }
  } catch {}
  return null;
}

function ColorRequirementResult({ deckSize, openingHand, onDraw, extraPerTurn, src, req, turn }: { deckSize: number; openingHand: number; onDraw: boolean; extraPerTurn: number; src: Record<'W'|'U'|'B'|'R'|'G', number>; req: Record<'W'|'U'|'B'|'R'|'G', number>; turn: number }){
  const draws = Math.max(0, openingHand) + Math.max(0, Math.floor(turn)) + (onDraw?1:0) + (Math.max(0, extraPerTurn) * Math.max(0, Math.floor(turn)));
  const colors = ['W','U','B','R','G'] as const;
  const counts = colors.map(c => Math.max(0, src[c]||0));
  const reqs = colors.map(c => Math.max(0, req[c]||0));
  const sumCounts = counts.reduce((a,b)=>a+b,0);
  const others = Math.max(0, deckSize - sumCounts);

  function probVector(xs:number[]){ const sx = xs.reduce((a,b)=>a+b,0); if (sx>draws) return 0; const rest = draws - sx; const top = xs.reduce((acc, x, i)=> acc * comb(counts[i], x), 1) * comb(others, rest); const bottom = comb(deckSize, draws); return bottom===0?0: top / bottom; }

  // Iterate feasible space with small bounds (draws typically <= 8-10)
  const bounds = counts.map((c,i)=> Math.min(c, draws));
  let total = 0;
  function loop(idx:number, acc:number[], left:number){
    if (idx===colors.length){ total += probVector(acc); return; }
    const min = reqs[idx];
    for (let x=min; x<=Math.min(bounds[idx], left); x++) loop(idx+1, [...acc, x], left-x);
  }
  loop(0, [], draws);
  const p = Math.max(0, Math.min(1, total));

  return (
    <motion.div
      key={`${p}-${turn}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="text-sm bg-neutral-950/50 rounded-lg p-3 border border-neutral-800"
    >
      <div className="mb-1">
        Odds to have at least {reqs.map((n,i)=> n>0? `${'WUBRG'[i]}${n>1?('×'+n):''}`:null).filter(Boolean).join(' + ')||'—'} by T{turn}:
      </div>
      <motion.div
        className="text-2xl font-bold font-mono mb-1"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
      >
        <span
          className="text-transparent bg-clip-text"
          style={{
            backgroundImage: p >= 0.7 ? 'linear-gradient(to right, #10b981, #34d399)' :
                             p >= 0.4 ? 'linear-gradient(to right, #fbbf24, #fcd34d)' :
                             'linear-gradient(to right, #ef4444, #f87171)'
          }}
        >
          {(p*100).toFixed(1)}%
        </span>
      </motion.div>
      <div className="text-xs opacity-60">Assumes color sources are disjoint counts and represent available sources by the requirement turn.</div>
    </motion.div>
  );
}
