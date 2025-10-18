"use client";
import React from "react";
import ImportDeckForMath from "@/components/ImportDeckForMath";

// Hypergeometric PMF/CDF helpers
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - k + i)) / i;
  }
  return res;
}

function hypergeomPMF(k: number, K: number, N: number, n: number): number {
  // K successes in population N, draw n, probability of k successes
  const a = comb(K, k);
  const b = comb(N - K, n - k);
  const c = comb(N, n);
  return c === 0 ? 0 : (a * b) / c;
}

function hypergeomCDFAtLeast(k: number, K: number, N: number, n: number): number {
  let p = 0;
  for (let i = k; i <= Math.min(n, K); i++) p += hypergeomPMF(i, K, N, n);
  return Math.max(0, Math.min(1, p));
}

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

  // Persist + update URL
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(); params.set('N', String(deckSize)); params.set('K', String(successCards)); params.set('H', String(openingHand)); params.set('T', String(turns)); params.set('k', String(atLeast)); params.set('draw', onDraw? '1':'0'); params.set('xpt', String(extraPerTurn));
      // Track usage for Mathlete badge
      try{ fetch('/api/events/tools',{ method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ type:'prob_run' }) }); } catch{}
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
    try { await navigator.clipboard?.writeText?.(text); } catch {}
  };

  const presets = [
    { label: 'Commander: N=99, K=10, H=7, T=4, k=1', vals: { N:99,K:10,H:7,T:4,k:1 } },
    { label: 'Modern: N=60, K=8, H=7, T=3, k=1', vals: { N:60,K:8,H:7,T:3,k:1 } },
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Probability Helpers</h1>
        <p className="text-sm opacity-80">Plain-English odds: “What’s the chance I see at least k of my chosen cards by turn T?” We model draws without replacement (like real shuffling) and compute the chance based on your deck size and counts.</p>
      </div>
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
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("deckId", deckId);
            window.history.replaceState({}, "", url.toString());
          } catch {}
          (async()=>{ try{ const res = await autoFillColorSources(deckId); if (res) { const { W,U,B,R,G } = res; setSrcW(Number(W)||0); setSrcU(Number(U)||0); setSrcB(Number(B)||0); setSrcR(Number(R)||0); setSrcG(Number(G)||0); } } catch{} })();
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-900 border border-neutral-800 rounded p-3">
        <label className="text-sm">
          <div className="opacity-70 mb-1">Deck size (N)</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={deckSize} onChange={e=>setDeckSize(parseInt(e.target.value||"0",10))} />
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">Desired cards in deck (K)</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={successCards} onChange={e=>setSuccessCards(parseInt(e.target.value||"0",10))} />
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">Opening hand size</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={openingHand} onChange={e=>setOpeningHand(parseInt(e.target.value||"0",10))} />
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">Turns (draws after opening)</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={turns} onChange={e=>setTurns(parseInt(e.target.value||"0",10))} />
        </label>
        <div className="text-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="opacity-70">At least (k)</div>
            <button onClick={()=>setAdvanced(a=>!a)} className="text-xs border rounded px-2 py-1">{advanced? 'Hide advanced' : 'Advanced'}</button>
          </div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={atLeast} onChange={e=>setAtLeast(parseInt(e.target.value||"0",10))} />
        </div>
        {advanced && (
          <>
            <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
              <div className="text-xs opacity-70">Quick K:</div>
              {[
                {label:'Lands', val:kLands, set:setKLands},
                {label:'Ramp', val:kRamp, set:setKRamp},
                {label:'Draw', val:kDraw, set:setKDraw},
                {label:'Removal', val:kRemoval, set:setKRemoval},
              ].map((c:any)=> (
                <div key={c.label} className="inline-flex items-center gap-1">
                  <button className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs" onClick={()=>setSuccessCards(c.val)}>{c.label}: {c.val}</button>
                  <input type="number" value={c.val} onChange={(e)=>c.set(parseInt(e.target.value||'0',10))} className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" />
                </div>
              ))}
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3 mt-2 text-sm">
              <label className="inline-flex items-center gap-2"><input type="checkbox" checked={onDraw} onChange={e=>setOnDraw(e.target.checked)} /> On the draw</label>
              <label className="inline-flex items-center gap-2">Extra draws/turn <input type="number" min={0} step={1} value={extraPerTurn} onChange={e=>setExtraPerTurn(Math.max(0, parseInt(e.target.value||'0',10)))} className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" /></label>
            </div>
          </>
        )}
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded p-3">
        <div className="text-sm">Draws by end of turn: <span className="font-mono">{draws}</span></div>
        <div className="text-lg mt-1">Probability: <span className="font-semibold text-emerald-400">{(p*100).toFixed(2)}%</span> <span className="text-xs opacity-70">(<span title="Hypergeometric: draws without replacement">hypergeometric</span>)</span></div>
        {advanced && (
          <div className="mt-1 text-xs flex items-center gap-2">
            <span className="opacity-70">Sensitivity:</span>
            <span className="px-1.5 py-0.5 rounded bg-neutral-800">K-1 → {(pKminus*100).toFixed(1)}%</span>
            <span className="px-1.5 py-0.5 rounded bg-neutral-800">K → {(p*100).toFixed(1)}%</span>
            <span className="px-1.5 py-0.5 rounded bg-neutral-800">K+1 → {(pKplus*100).toFixed(1)}%</span>
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
          <button onClick={copySummary} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Copy summary</button>
          {advanced && (
            <>
          <button onClick={()=>{ try{ navigator.clipboard?.writeText?.(window.location.href); fetch('/api/events/tools',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'prob_save'})}); } catch{} }} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Copy link</button>
              <div className="flex flex-wrap gap-2 text-xs">
                {presets.map(pr => (
                  <button key={pr.label} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={() => { setDeckSize(pr.vals.N as any); setSuccessCards(pr.vals.K as any); setOpeningHand(pr.vals.H as any); setTurns(pr.vals.T as any); setAtLeast(pr.vals.k as any); }}>{pr.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {advanced && (
      <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
        <div className="font-medium">Color requirement solver</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-sm opacity-80">Color sources in deck <span className="text-xs opacity-60">(Detected: W {srcW} • U {srcU} • B {srcB} • R {srcR} • G {srcG})</span></div>
            <div className="grid grid-cols-5 gap-2">
              {[
                {l:'W',v:srcW,set:setSrcW},{l:'U',v:srcU,set:setSrcU},{l:'B',v:srcB,set:setSrcB},{l:'R',v:srcR,set:setSrcR},{l:'G',v:srcG,set:setSrcG},
              ].map(c=> (
                <label key={c.l} className="text-xs">
                  <div className="opacity-70 mb-1">{c.l}</div>
                  <input type="number" value={c.v} onChange={e=>c.set(parseInt(e.target.value||'0',10))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm opacity-80">Need by turn</div>
            <div className="grid grid-cols-6 gap-2 items-end">
              {[
                {l:'W',v:reqW,set:setReqW},{l:'U',v:reqU,set:setReqU},{l:'B',v:reqB,set:setReqB},{l:'R',v:reqR,set:setReqR},{l:'G',v:reqG,set:setReqG},
              ].map(c=> (
                <label key={c.l} className="text-xs">
                  <div className="opacity-70 mb-1">{c.l}</div>
                  <input type="number" min={0} value={c.v} onChange={e=>c.set(parseInt(e.target.value||'0',10))} className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
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
      </div>
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

  // Multivariate hypergeometric: sum over x_i >= req_i, sum x_i <= draws
  function comb(n:number,k:number){ if(k<0||k>n) return 0; if(k===0||k===n) return 1; k=Math.min(k,n-k); let r=1; for(let i=1;i<=k;i++){ r=r*(n-k+i)/i; } return r; }
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
    <div className="text-sm">
      <div>Odds to have at least {reqs.map((n,i)=> n>0? `${'WUBRG'[i]}${n>1?('×'+n):''}`:null).filter(Boolean).join(' + ')||'—'} by T{turn}: <span className="font-semibold text-emerald-400">{(p*100).toFixed(2)}%</span></div>
      <div className="text-xs opacity-60">Assumes color sources are disjoint counts and represent available sources by the requirement turn.</div>
    </div>
  );
}
