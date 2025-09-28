"use client";
import React from "react";
import ImportDeckForMath from "@/components/ImportDeckForMath";

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
  const [minKeep, setMinKeep] = React.useState(1); // keep if >= this many successes
  const [iterations, setIterations] = React.useState(20000);

  // Load from localStorage or query params
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const applyN = (k: string, setter: (n:number)=>void) => { const v = params.get(k); if (v!=null) { const n = parseInt(v,10); if (Number.isFinite(n)) setter(n); } };
      const lsN = (k: string, setter: (n:number)=>void) => { const v = localStorage.getItem('mull:'+k); if (v!=null) { const n = parseInt(v,10); if (Number.isFinite(n)) setter(n); } };
      applyN('N', setDeckSize); applyN('K', setSuccessCards); applyN('k', setMinKeep); applyN('I', setIterations);
      lsN('N', setDeckSize); lsN('K', setSuccessCards); lsN('k', setMinKeep); lsN('I', setIterations);
    } catch {}
  }, []);

  // Persist + update URL
  React.useEffect(() => {
    try {
      const params = new URLSearchParams(); params.set('N', String(deckSize)); params.set('K', String(successCards)); params.set('k', String(minKeep)); params.set('I', String(iterations));
      const url = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', url);
      localStorage.setItem('mull:N', String(deckSize));
      localStorage.setItem('mull:K', String(successCards));
      localStorage.setItem('mull:k', String(minKeep));
      localStorage.setItem('mull:I', String(iterations));
    } catch {}
  }, [deckSize, successCards, minKeep, iterations]);

  const [result, setResult] = React.useState<{ keep7: number; keep6: number; keep5: number; successRate: number } | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    await new Promise(r => setTimeout(r, 0)); // yield to paint

    let keep7 = 0, keep6 = 0, keep5 = 0, ok = 0;
    const iters = Math.max(1, iterations);

    for (let i = 0; i < iters; i++) {
      // London mulligan approximation: try 7, else 6, else 5
      const s7 = drawSample(deckSize, successCards, 7);
      if (s7 >= minKeep) { keep7++; ok++; continue; }
      const s6 = drawSample(deckSize, successCards, 6);
      if (s6 >= minKeep) { keep6++; ok++; continue; }
      const s5 = drawSample(deckSize, successCards, 5);
      if (s5 >= minKeep) { keep5++; ok++; continue; }
    }

    setResult({ keep7, keep6, keep5, successRate: ok / iters });
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

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-semibold">Hand / Mulligan Simulator</h1>
      <p className="text-sm opacity-80">Approximate keep rates with simple London mulligan logic (keep if hand has at least k desired cards).</p>

      {/* Import from My Decks */}
      <ImportDeckForMath
        storageKey="mull"
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
          <div className="opacity-70 mb-1">Keep if at least (k)</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={minKeep} onChange={e=>setMinKeep(parseInt(e.target.value||"0",10))} />
        </label>
        <label className="text-sm">
          <div className="opacity-70 mb-1">Iterations</div>
          <input type="number" className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1"
            value={iterations} onChange={e=>setIterations(parseInt(e.target.value||"0",10))} />
        </label>
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
        <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-1">
          <div className="text-sm">Keep on 7: <span className="font-mono">{result.keep7}</span></div>
          <div className="text-sm">Keep on 6: <span className="font-mono">{result.keep6}</span></div>
          <div className="text-sm">Keep on 5: <span className="font-mono">{result.keep5}</span></div>
          <div className="text-lg mt-1">Success rate: <span className="font-semibold text-emerald-400">{(result.successRate*100).toFixed(2)}%</span></div>
          <div className="text-xs opacity-60">This simple model ignores scry/put-on-bottom choices after mulligan; useful for quick estimates.</div>
        </div>
      )}
    </div>
  );
}
