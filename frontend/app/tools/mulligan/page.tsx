"use client";
import React from "react";
import ImportDeckForMath from "@/components/ImportDeckForMath";
import HandTestingWidget from "@/components/HandTestingWidget";

// small hypergeometric helpers for heuristics
function comb(n: number, k: number): number { if (k<0||k>n) return 0; if (k===0||k===n) return 1; k=Math.min(k,n-k); let r=1; for(let i=1;i<=k;i++){ r=r*(n-k+i)/i; } return r; }
function hypergeomPMF(k: number, K: number, N: number, n: number): number { const a=comb(K,k), b=comb(N-K, n-k), c=comb(N,n); return c===0?0:(a*b)/c; }
function hypergeomCDFAtLeast(k: number, K: number, N: number, n: number): number { let p=0; for(let i=k;i<=Math.min(n,K);i++) p+=hypergeomPMF(i,K,N,n); return Math.max(0, Math.min(1, p)); }

function drawSample(deckSize: number, successCount: number, n: number): number {
  // Without replacement; simple count of successes in n cards
  let successes = 0;
  let good = successCount;
  let bad = deckSize - successCount;
  for (let i = 0; i < n; i++) {
    const total = good + bad;
    if (total <= 0) break;
    const r = Math.random() * total;
    if (r < good) { successes++; good--; } else { bad--; }
  }
  return successes;
}

export default function MulliganSimulatorPage() {
  const [deckSize, setDeckSize] = React.useState(99);
  const [successCards, setSuccessCards] = React.useState(10);
  const [landsInDeck, setLandsInDeck] = React.useState(36);
  const [deckCards, setDeckCards] = React.useState<Array<{ name: string; qty: number }>>([]);
  
  const [minKeep, setMinKeep] = React.useState(1); // keep if >= this many successes
  const [minLands, setMinLands] = React.useState(2);
  const [maxLands, setMaxLands] = React.useState(5);
  const [iterations, setIterations] = React.useState(20000);
  const [freeMull7, setFreeMull7] = React.useState(true); // Commander free mulligan
  const [onDraw, setOnDraw] = React.useState(false); // play/draw modeling
  const [advanced, setAdvanced] = React.useState(false);
  // optional heuristics
  const [rampInDeck, setRampInDeck] = React.useState(10);
  const [removalInDeck, setRemovalInDeck] = React.useState(10);
  const [needRampBy, setNeedRampBy] = React.useState<0|2|3>(0);
  const [needRemovalBy, setNeedRemovalBy] = React.useState<0|2|3>(0);
  const [srcW,setSrcW]=React.useState(10); const [srcU,setSrcU]=React.useState(10); const [srcB,setSrcB]=React.useState(10); const [srcR,setSrcR]=React.useState(10); const [srcG,setSrcG]=React.useState(10);
  const [reqW,setReqW]=React.useState(0); const [reqU,setReqU]=React.useState(0); const [reqB,setReqB]=React.useState(0); const [reqR,setReqR]=React.useState(0); const [reqG,setReqG]=React.useState(0); const [reqTurn,setReqTurn]=React.useState(0);

  // Load from localStorage or query params
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const applyN = (k: string, setter: (n:number)=>void) => { const v = params.get(k); if (v!=null) { const n = parseInt(v,10); if (Number.isFinite(n)) setter(n); } };
      const lsN = (k: string, setter: (n:number)=>void) => { const v = localStorage.getItem('mull:'+k); if (v!=null) { const n = parseInt(v,10); if (Number.isFinite(n)) setter(n); } };
      applyN('N', setDeckSize); applyN('K', setSuccessCards); applyN('L', setLandsInDeck); applyN('k', setMinKeep); applyN('I', setIterations); applyN('minL', setMinLands); applyN('maxL', setMaxLands);
      lsN('N', setDeckSize); lsN('K', setSuccessCards); lsN('L', setLandsInDeck); lsN('k', setMinKeep); lsN('I', setIterations); lsN('minL', setMinLands); lsN('maxL', setMaxLands);
      const fm = params.get('fm'); if (fm!=null) setFreeMull7(fm==='1'); else { const lsfm = localStorage.getItem('mull:fm'); if (lsfm!=null) setFreeMull7(lsfm==='1'); }
      const dr = params.get('draw'); if (dr!=null) setOnDraw(dr==='1'); else { const lsd = localStorage.getItem('mull:draw'); if (lsd!=null) setOnDraw(lsd==='1'); }
      const adv = localStorage.getItem('mull:adv'); if (adv!=null) setAdvanced(adv==='1');
    } catch {}
  }, []);

  React.useEffect(()=>{ try{ localStorage.setItem('mull:adv', advanced ? '1':'0'); } catch{} }, [advanced]);

  // Persist + update URL
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(); params.set('N', String(deckSize)); params.set('K', String(successCards)); params.set('L', String(landsInDeck)); params.set('k', String(minKeep)); params.set('I', String(iterations)); params.set('minL', String(minLands)); params.set('maxL', String(maxLands)); params.set('fm', freeMull7?'1':'0');
      const url = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', url);
      localStorage.setItem('mull:N', String(deckSize));
      localStorage.setItem('mull:K', String(successCards));
      localStorage.setItem('mull:L', String(landsInDeck));
      localStorage.setItem('mull:k', String(minKeep));
      localStorage.setItem('mull:I', String(iterations));
      localStorage.setItem('mull:minL', String(minLands));
      localStorage.setItem('mull:maxL', String(maxLands));
      localStorage.setItem('mull:fm', freeMull7?'1':'0');
      localStorage.setItem('mull:draw', onDraw?'1':'0');
    } catch {}
  }, [deckSize, successCards, landsInDeck, minKeep, iterations, minLands, maxLands, freeMull7, onDraw]);

  const [result, setResult] = React.useState<{ keep7: number; keep7Hands:number; keep6: number; keep5: number; successRate: number; ciLow:number; ciHigh:number } | null>(null);
  const [busy, setBusy] = React.useState(false);

  function drawHandCounts(N:number, K:number, L:number, n:number){
    // sample successes and lands jointly via sequential without replacement
    // Draw lands first, then successes from remaining non-land pool approximatively
    const lands = drawSample(N, L, n);
    const nonLandDraws = n - Math.min(lands, n);
    const remainingN = N - L;
    const successesNonLand = Math.max(0, K - Math.min(K, Math.min(L, n))); // assume successes not lands; approximation
    const succ = drawSample(remainingN, Math.max(0, K - Math.min(K, 0)), nonLandDraws); // fallback simple
    return { successes: succ, lands };
  }

  function shouldKeep(hand:{successes:number;lands:number}){
    const effMin = Math.max(0, minLands - (onDraw?1:0));
    const effMax = maxLands;
    if (hand.lands < effMin || hand.lands > effMax) return false;
    if (hand.successes < minKeep) return false;
    // Optional ramp/removal by turn using odds threshold
    const startDraws = 7 + (onDraw?1:0);
    if (needRampBy) { const draws = startDraws + needRampBy; const p = hypergeomCDFAtLeast(1, rampInDeck, deckSize, draws); if (p < 0.5) return false; }
    if (needRemovalBy) { const draws = startDraws + needRemovalBy; const p = hypergeomCDFAtLeast(1, removalInDeck, deckSize, draws); if (p < 0.5) return false; }
    if (reqTurn>0 && (reqW||reqU||reqB||reqR||reqG)){
      const draws = startDraws + reqTurn;
      const counts = [srcW,srcU,srcB,srcR,srcG]; const reqs=[reqW,reqU,reqB,reqR,reqG];
      const others = Math.max(0, deckSize - counts.reduce((a,b)=>a+b,0));
      function probColors(){
        const lim = Math.min(draws, 10);
        const bounds = counts.map(c=>Math.min(c, lim));
        function probVector(xs:number[]){ const sx = xs.reduce((a,b)=>a+b,0); if (sx>draws) return 0; const rest=draws-sx; const top = xs.reduce((acc,x,i)=>acc*comb(counts[i],x),1)*comb(others,rest); const bot = comb(deckSize, draws); return bot===0?0:top/bot; }
        let tot=0; function loop(i:number, acc:number[], left:number){ if(i===5){ tot+=probVector(acc); return;} const min=reqs[i]; for(let x=min;x<=Math.min(bounds[i],left);x++) loop(i+1,[...acc,x], left-x);} loop(0,[],draws); return tot; }
      const pc = probColors(); if (pc < 0.5) return false;
    }
    return true;
  }

  async function run() {
    setBusy(true);
    await new Promise(r => setTimeout(r, 0)); // yield to paint

    let keep7 = 0, keep6 = 0, keep5 = 0, ok = 0, seen7=0;
    let sumLandsKept = 0, keptCount = 0;
    const examplesKeep: Array<{succ:number;lands:number}> = [];
    const examplesShip: Array<{succ:number;lands:number}> = [];
    const iters = Math.max(1, iterations);

    for (let i = 0; i < iters; i++) {
      // London mulligan with optional one free 7
      let mullCount = 0;
      let kept = false;
      for (;;){
        const hand7 = drawHandCounts(deckSize, successCards, landsInDeck, 7);
        seen7++;
        if (shouldKeep(hand7)) { keep7++; ok++; kept = true; sumLandsKept+=hand7.lands; keptCount++; if (examplesKeep.length<3) examplesKeep.push({succ:hand7.successes, lands:hand7.lands}); break; }
        if (examplesShip.length<3) examplesShip.push({succ:hand7.successes, lands:hand7.lands});
        if (freeMull7 && mullCount===0){ mullCount++; continue; }
        // try at 6
        const hand6 = drawHandCounts(deckSize, successCards, landsInDeck, 7);
        // bottom one following simple strategy: prefer bottom excess lands, else non-success
        let h6 = { ...hand6 };
        if (h6.lands > maxLands) h6.lands--; else if (h6.successes>minKeep) h6.successes--; else h6.lands = Math.max(0, h6.lands-1);
        if (shouldKeep(h6)) { keep6++; ok++; kept = true; sumLandsKept+=h6.lands; keptCount++; if (examplesKeep.length<3) examplesKeep.push({succ:h6.successes, lands:h6.lands}); break; }
        // try at 5
        const hand5 = drawHandCounts(deckSize, successCards, landsInDeck, 7);
        let h5 = { ...hand5 };
        for (let b=0;b<2;b++){ if (h5.lands > maxLands) h5.lands--; else if (h5.successes>minKeep) h5.successes--; else h5.lands=Math.max(0,h5.lands-1); }
        if (shouldKeep(h5)) { keep5++; ok++; kept = true; sumLandsKept+=h5.lands; keptCount++; if (examplesKeep.length<3) examplesKeep.push({succ:h5.successes, lands:h5.lands}); break; }
        break;
      }
      if (!kept) {}
    }

    const p = ok / iters; const se = Math.sqrt(Math.max(1e-9,p*(1-p)/iters)); const ciLow = Math.max(0, p - 1.96*se); const ciHigh = Math.min(1, p + 1.96*se);
    const avgLandsKept = keptCount ? (sumLandsKept/keptCount) : 0;
    setResult({ keep7, keep7Hands: seen7, keep6, keep5, successRate: p, ciLow, ciHigh } as any);
    (window as any)._mull_examples = { keep: examplesKeep, ship: examplesShip, avgLandsKept };
    try{ fetch('/api/events/tools',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ type:'mull_run', iters }) }); } catch{}
    setBusy(false);
  }

  const copySummary = async () => {
    const text = `Mulligan keep rate with N=${deckSize}, K=${successCards}, minKeep=${minKeep}, iters=${iterations}: ${(result?.successRate ? result.successRate*100 : 0).toFixed(2)}%`;
    try { await navigator.clipboard?.writeText?.(text); } catch {}
  };

  const presets = [
    { label: 'Commander baseline', vals: { N:99, K:10, k:1, I:20000 } },
    { label: '60-card baseline', vals: { N:60, K:8, k:1, I:20000 } },
  ];

  // Suggested k values for quick clicks
  const kChips = [1, 2, 3];

  const [deckText, setDeckText] = React.useState("");
  const [parseError, setParseError] = React.useState("");
  
  const parseDecklistAndRun = () => {
    const text = deckText.trim();
    if (!text) {
      setParseError("Please paste a decklist");
      return;
    }
    
    setParseError("");
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let totalCards = 0;
    let landCount = 0;
    
    // Common land types and basic lands
    const landKeywords = /\bland\b|island|mountain|forest|plains|swamp|dual land|fetch|shock|triome|pathway/i;
    const basicLands = /^(island|mountain|forest|plains|swamp)$/i;
    
    for (const line of lines) {
      // Match patterns like "1x Card Name" or "3 Sol Ring" or just "Sol Ring"
      const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      const qty = match ? parseInt(match[1], 10) : 1;
      const cardName = match ? match[2] : line;
      
      // Skip comment lines
      if (cardName.startsWith('//') || cardName.startsWith('#')) continue;
      
      totalCards += qty;
      
      // Detect lands
      if (landKeywords.test(cardName) || basicLands.test(cardName)) {
        landCount += qty;
      }
    }
    
    if (totalCards === 0) {
      setParseError("No cards detected in decklist");
      return;
    }
    
    // Auto-populate form
    setDeckSize(totalCards);
    setLandsInDeck(landCount);
    
    // Run simulation immediately
    setTimeout(() => run(), 100);
  };

  return (
    <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT COLUMN: Main content */}
          <div className="lg:col-span-8 space-y-4">
      <header className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-amber-900/20 via-orange-900/10 to-red-900/20 p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">🃏</span>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
              Mulligan Simulator
            </h1>
          </div>
          <p className="text-base text-neutral-300 max-w-4xl leading-relaxed">
            Test your deck's consistency with real opening hand simulations. See keep rates for 7/6/5 card hands using London mulligan rules. Customize land requirements, key cards, and mana ratios to optimize your deck's performance.
          </p>
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
            <div className="flex items-center gap-1.5 text-amber-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              <span>London Mulligan</span>
            </div>
            <div className="flex items-center gap-1.5 text-orange-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              <span>Keep Rate Analysis</span>
            </div>
            <div className="flex items-center gap-1.5 text-red-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span>10,000 Simulations</span>
            </div>
          </div>
        </div>
      </header>
      {advanced && (
        <div className="sticky top-2 z-20 bg-neutral-900/80 backdrop-blur border border-neutral-800 rounded px-3 py-2 flex items-center justify-between">
          <div className="text-xs opacity-80">Advanced options open</div>
          <button onClick={()=>setAdvanced(false)} className="text-xs border rounded px-2 py-1">Hide advanced</button>
        </div>
      )}

      {/* Paste Decklist Input */}
      <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-3">
        <div className="text-sm font-semibold">Paste Your Decklist</div>
        <textarea
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
          placeholder="Paste your decklist here (e.g., '1 Sol Ring', '36 Forest', etc.)"
          className="w-full h-32 bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-sm font-mono resize-none"
        />
        {parseError && (
          <div className="text-xs text-red-400">{parseError}</div>
        )}
        <button
          onClick={parseDecklistAndRun}
          disabled={busy || !deckText.trim()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Analyzing...' : 'Analyze Decklist'}
        </button>
      </div>

      {/* Import from My Decks */}
      <ImportDeckForMath
        storageKey="mull"
        onApply={({ deckId, deckSize: N, successCards: K, deckCards: cards }: any) => {
          setDeckSize(N || deckSize);
          if (K && Number.isFinite(K)) setSuccessCards(K);
          if (cards && Array.isArray(cards)) setDeckCards(cards);
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("deckId", deckId);
            window.history.replaceState({}, "", url.toString());
          } catch {}
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-900 border border-neutral-800 rounded p-3">
        <label className="text-sm">
          <div className="opacity-70 mb-1">Deck size</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={deckSize} onChange={e=>setDeckSize(parseInt(e.target.value||"0",10))} />
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">Desired cards in deck</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={successCards} onChange={e=>setSuccessCards(parseInt(e.target.value||"0",10))} />
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">Lands in deck</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={landsInDeck} onChange={e=>setLandsInDeck(parseInt(e.target.value||"0",10))} />
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">Keep if at least (k)</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={minKeep} onChange={e=>setMinKeep(parseInt(e.target.value||"0",10))} />
        </label>
        <div className="text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="opacity-70">Iterations</div>
            <button onClick={()=>setAdvanced(a=>!a)} className="text-xs border rounded px-2 py-1">{advanced? 'Hide advanced' : 'Advanced'}</button>
          </div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={iterations} onChange={e=>setIterations(parseInt(e.target.value||"0",10))} />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex items-center gap-2">Min lands <input type="number" className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={minLands} onChange={e=>setMinLands(parseInt(e.target.value||'0',10))}/></label>
          <label className="inline-flex items-center gap-2">Max lands <input type="number" className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={maxLands} onChange={e=>setMaxLands(parseInt(e.target.value||'0',10))}/></label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={freeMull7} onChange={e=>setFreeMull7(e.target.checked)} /> Free 7 (Commander)</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={onDraw} onChange={e=>setOnDraw(e.target.checked)} /> On the draw</label>
          {advanced && (
            <>
              <label className="inline-flex items-center gap-2">Need ramp by
                <select value={needRampBy} onChange={e=>setNeedRampBy(parseInt(e.target.value,10) as any)} className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5">
                  <option value={0}>—</option>
                  <option value={2}>T2</option>
                  <option value={3}>T3</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2">Need removal by
                <select value={needRemovalBy} onChange={e=>setNeedRemovalBy(parseInt(e.target.value,10) as any)} className="bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5">
                  <option value={0}>—</option>
                  <option value={2}>T2</option>
                  <option value={3}>T3</option>
                </select>
              </label>
            </>
          )}
        </div>
        {advanced && (
          <>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">Ramp in deck
                <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={rampInDeck} onChange={e=>setRampInDeck(parseInt(e.target.value||'0',10))} />
              </label>
              <label className="text-sm">Removal in deck
                <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={removalInDeck} onChange={e=>setRemovalInDeck(parseInt(e.target.value||'0',10))} />
              </label>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs opacity-70 mb-1">Must-have colors by turn (optional)</div>
              <div className="grid grid-cols-6 gap-2 items-end">
                {[
                  {l:'W',v:srcW,set:setSrcW},{l:'U',v:srcU,set:setSrcU},{l:'B',v:srcB,set:setSrcB},{l:'R',v:srcR,set:setSrcR},{l:'G',v:srcG,set:setSrcG},
                ].map(c=> (
                  <label key={c.l} className="text-xs">
                    <div className="opacity-70 mb-1">{c.l} src</div>
                    <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={c.v} onChange={e=>c.set(parseInt(e.target.value||'0',10))} />
                  </label>
                ))}
                <label className="text-xs">
                  <div className="opacity-70 mb-1">Turn</div>
                  <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" min={0} max={4} value={reqTurn} onChange={e=>setReqTurn(parseInt(e.target.value||'0',10))} />
                </label>
              </div>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {[
                  {l:'W',v:reqW,set:setReqW},{l:'U',v:reqU,set:setReqU},{l:'B',v:reqB,set:setReqB},{l:'R',v:reqR,set:setReqR},{l:'G',v:reqG,set:setReqG},
                ].map(c=> (
                  <label key={c.l} className="text-xs">
                    <div className="opacity-70 mb-1">need {c.l}</div>
                    <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" min={0} value={c.v} onChange={e=>c.set(parseInt(e.target.value||'0',10))} />
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={run} disabled={busy} className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-60">
          {busy ? "Running…" : "Run"}
        </button>
        <button onClick={copySummary} className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-white text-sm">Copy summary</button>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {presets.map(p => (
            <button key={p.label} onClick={() => { setDeckSize(p.vals.N as any); setSuccessCards(p.vals.K as any); setMinKeep(p.vals.k as any); setIterations(p.vals.I as any); }} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">{p.label}</button>
          ))}
          <span className="opacity-70 ml-2">k:</span>
          {kChips.map(k => (
            <button key={k} onClick={() => setMinKeep(k)} className={`px-2 py-1 rounded ${minKeep===k? 'bg-emerald-700':'bg-neutral-800 hover:bg-neutral-700'}`}>{k}</button>
          ))}
        </div>
      </div>

      {result && (
        <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
          <div className="text-sm">Keep on 7: <span className="font-mono">{result.keep7}</span></div>
          <div className="text-sm">Keep on 6: <span className="font-mono">{result.keep6}</span></div>
          <div className="text-sm">Keep on 5: <span className="font-mono">{result.keep5}</span></div>
          <div className="text-lg mt-1">Success rate: <span className="font-semibold text-emerald-400">{(result.successRate*100).toFixed(2)}%</span> <span className="text-xs opacity-70">(95% CI {Math.round(result.ciLow*10000)/100}% – {Math.round(result.ciHigh*10000)/100}%)</span></div>
          <div className="text-xs opacity-60">Model: London with simple bottom priorities (excess lands → non-essential). Free 7 toggle simulates the Commander mulligan.</div>
          {advanced && <ExamplesBlock />}
          {advanced && <AdviceBlock deckSize={deckSize} successCards={successCards} landsInDeck={landsInDeck} minKeep={minKeep} minLands={minLands} maxLands={maxLands} iterations={Math.min(4000, Math.max(500, Math.floor(iterations/5)))} />}
        </div>
      )}
          </div>
          
          {/* RIGHT COLUMN: Hand Testing Widget sidebar */}
          <aside className="lg:col-span-4">
            <div className="sticky top-4 space-y-4">
              {/* Interactive Hand Testing Widget */}
              <HandTestingWidget 
                deckCards={deckCards}
                compact={false}
                className=""
              />
              
              {/* Note about per-deck availability */}
              <div className="bg-gradient-to-r from-amber-900/20 to-amber-800/10 border border-amber-700/40 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center text-black">
                    🃏
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-200 text-sm">Also Available Per Deck!</h3>
                    <p className="text-xs opacity-80 mt-1">
                      This hand testing widget is also available on <a href="/my-decks" className="underline hover:text-amber-300">individual deck pages</a> with your specific deck's cards for more focused testing!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ExamplesBlock(){
  const ex = (window as any)._mull_examples as { keep:Array<{succ:number;lands:number}>; ship:Array<{succ:number;lands:number}>; avgLandsKept:number } | undefined;
  if (!ex) return null;
  return (
    <div className="text-xs">
      <div className="opacity-70">Examples</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
        <div>
          <div className="font-medium">Sample keeps</div>
          <ul className="list-disc ml-4">
            {(ex.keep||[]).map((h,i)=>(<li key={i}>lands {h.lands}, desired {h.succ}</li>))}
          </ul>
        </div>
        <div>
          <div className="font-medium">Sample ships</div>
          <ul className="list-disc ml-4">
            {(ex.ship||[]).map((h,i)=>(<li key={i}>lands {h.lands}, desired {h.succ}</li>))}
          </ul>
        </div>
      </div>
      <div className="mt-1 opacity-70">Avg lands kept: {ex.avgLandsKept.toFixed(2)}</div>
    </div>
  );
}

function AdviceBlock({ deckSize, successCards, landsInDeck, minKeep, minLands, maxLands, iterations }:{ deckSize:number; successCards:number; landsInDeck:number; minKeep:number; minLands:number; maxLands:number; iterations:number }){
  const simulate = (L:number, K:number)=>{
    let ok=0; for(let i=0;i<iterations;i++){ const hand={ successes: drawSample(deckSize, K, 7), lands: drawSample(deckSize, L, 7) }; if (hand.lands>=minLands && hand.lands<=maxLands && hand.successes>=minKeep) ok++; }
    return ok/iterations;
  };
  const base = simulate(landsInDeck, successCards);
  const plusL = simulate(landsInDeck+2, successCards);
  const plusK = simulate(landsInDeck, successCards+1);
  const target = 0.8;
  const recs:string[]=[];
  if (base<target){ if (plusL>base+0.03) recs.push("+2 lands"); if (plusK>base+0.02) recs.push("+1 cheap draw/removal"); }
  return (
    <div className="text-xs">
      <div className="opacity-70">What to change to hit 80% keepable</div>
      <div>Now: {(base*100).toFixed(1)}%. Try {recs.length?recs.join(' or '):'tuning lands or cheap interaction'} → {(Math.max(plusL, plusK)*100).toFixed(1)}%.</div>
    </div>
  );
}
