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
    } catch {}
  }, []);

  // Persist + update URL
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(); params.set('N', String(deckSize)); params.set('K', String(successCards)); params.set('H', String(openingHand)); params.set('T', String(turns)); params.set('k', String(atLeast));
      const url = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', url);
      localStorage.setItem('prob:N', String(deckSize));
      localStorage.setItem('prob:K', String(successCards));
      localStorage.setItem('prob:H', String(openingHand));
      localStorage.setItem('prob:T', String(turns));
      localStorage.setItem('prob:k', String(atLeast));
    } catch {}
  }, [deckSize, successCards, openingHand, turns, atLeast]);

  const draws = Math.max(0, openingHand) + Math.max(0, Math.floor(turns));
  const p = hypergeomCDFAtLeast(atLeast, successCards, deckSize, draws);

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
      <h1 className="text-xl font-semibold">Probability Helpers</h1>
      <p className="text-sm opacity-80">Odds of drawing at least k desired cards by a given turn (hypergeometric).</p>

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
        <label className="text-sm">
          <div className="opacity-70 mb-1">At least (k)</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={atLeast} onChange={e=>setAtLeast(parseInt(e.target.value||"0",10))} />
        </label>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded p-3">
        <div className="text-sm">Draws by end of turn: <span className="font-mono">{draws}</span></div>
        <div className="text-lg mt-1">Probability: <span className="font-semibold text-emerald-400">{(p*100).toFixed(2)}%</span></div>
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
          <div className="flex flex-wrap gap-2 text-xs">
            {presets.map(pr => (
              <button key={pr.label} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700" onClick={() => { setDeckSize(pr.vals.N as any); setSuccessCards(pr.vals.K as any); setOpeningHand(pr.vals.H as any); setTurns(pr.vals.T as any); setAtLeast(pr.vals.k as any); }}>{pr.label}</button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs opacity-60">Assumes 1 card drawn per turn on your draw step and no replacement effects.</p>
    </div>
  );
}
