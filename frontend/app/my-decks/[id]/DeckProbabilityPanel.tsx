"use client";
import React from "react";

function comb(n: number, k: number): number { if (k < 0 || k > n) return 0; if (k === 0 || k === n) return 1; k = Math.min(k, n - k); let res = 1; for (let i=1;i<=k;i++) res = (res * (n - k + i)) / i; return res; }
function hypergeomPMF(k: number, K: number, N: number, n: number): number { const a = comb(K, k); const b = comb(N - K, n - k); const c = comb(N, n); return c===0?0:(a*b)/c; }
function hypergeomCDFAtLeast(k: number, K: number, N: number, n: number): number { let p=0; for (let i=k;i<=Math.min(n,K);i++) p+=hypergeomPMF(i,K,N,n); return Math.max(0, Math.min(1, p)); }

export default function DeckProbabilityPanel({ deckId, isPro }: { deckId: string; isPro: boolean }) {
  const [N, setN] = React.useState(99);
  // Derive deck size from current deck
  React.useEffect(() => {
    (async () => {
      try {
        if (!deckId) return;
        const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
        const j = await r.json().catch(()=>({ ok:false }));
        if (!r.ok || j?.ok===false) return;
const rows = Array.isArray(j.cards) ? j.cards as Array<{ name: string; qty: number }> : [];
        const total = rows.reduce((s, it) => s + Math.max(0, Number(it.qty)||0), 0);
        if (total > 0) setN(total);
      } catch {}
    })();
  }, [deckId]);
  const [K, setK] = React.useState(10);
  const [H, setH] = React.useState(7);
  const [T, setT] = React.useState(4);
  const [k, setk] = React.useState(1);

  React.useEffect(() => { try { const p = (key:string, s:(n:number)=>void) => { const v = localStorage.getItem('prob-inline:'+key); if (v!=null) { const n = parseInt(v,10); if (Number.isFinite(n)) s(n); } }; p('N',setN); p('K',setK); p('H',setH); p('T',setT); p('k',setk); } catch {} }, []);
  React.useEffect(() => { try { localStorage.setItem('prob-inline:N', String(N)); localStorage.setItem('prob-inline:K', String(K)); localStorage.setItem('prob-inline:H', String(H)); localStorage.setItem('prob-inline:T', String(T)); localStorage.setItem('prob-inline:k', String(k)); } catch {} }, [N,K,H,T,k]);

  const draws = Math.max(0, H) + Math.max(0, Math.floor(T));
  const p = hypergeomCDFAtLeast(k, K, N, draws);

  async function setKFromTag(tag: 'lands'|'ramp'|'draw'|'removal') {
    try {
      // Build deck text
      const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({ ok:false }));
      if (!r.ok || j?.ok===false) return;
const rows = Array.isArray(j.cards) ? j.cards as Array<{ name: string; qty: number }> : [];
      const deckText = rows.map(it => `${it.qty} ${it.name}`).join('\n');
      const a = await fetch('/api/deck/analyze', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckText, format:'Commander', useScryfall:true }) });
      const aj = await a.json().catch(()=>({}));
      const c = aj?.counts || {};
      const map: any = { lands: c.lands||0, ramp: c.ramp||0, draw: c.draw||0, removal: c.removal||0 };
      const val = Number(map[tag] || 0);
      if (val>0) setK(val);
    } catch {}
  }

  return (
    <section className="mt-6 rounded-xl border border-neutral-800 p-3 space-y-2">
      <div className="text-sm font-medium flex items-center gap-2">Probability {!isPro && (<span className="inline-flex items-center rounded bg-amber-300 text-black text-[10px] font-bold px-1.5 py-0.5 uppercase">Pro</span>)} </div>
      {!isPro && (<div className="text-[11px] opacity-70">Pro only — estimate odds (hypergeometric) such as drawing key cards by a given turn.</div>)}

      <div className="text-[11px] flex flex-wrap gap-2">
        <span className="opacity-70">K presets:</span>
        {[4,6,8,10,12].map(v => (<button key={v} className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700" disabled={!isPro} onClick={()=>setK(v)}>{v}</button>))}
        <span className="opacity-70 ml-2">Set K from tag:</span>
        {(['lands','ramp','draw','removal'] as const).map(t => (<button key={t} className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 capitalize" disabled={!isPro} onClick={()=>setKFromTag(t)}>{t}</button>))}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col opacity-90">
          <span className="opacity-70">Deck size (N)</span>
          <input type="number" className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={N} onChange={e=>setN(parseInt(e.target.value||"0",10))} disabled={!isPro} />
        </label>
        <label className="flex flex-col opacity-90">
          <span className="opacity-70">Desired cards (K)</span>
          <input type="number" className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={K} onChange={e=>setK(parseInt(e.target.value||"0",10))} disabled={!isPro} />
        </label>
        <label className="flex flex-col opacity-90">
          <span className="opacity-70">Opening hand</span>
          <input type="number" className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={H} onChange={e=>setH(parseInt(e.target.value||"0",10))} disabled={!isPro} />
        </label>
        <label className="flex flex-col opacity-90">
          <span className="opacity-70">Turns</span>
          <input type="number" className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={T} onChange={e=>setT(parseInt(e.target.value||"0",10))} disabled={!isPro} />
        </label>
        <label className="flex flex-col opacity-90">
          <span className="opacity-70">At least (k)</span>
          <input type="number" className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1" value={k} onChange={e=>setk(parseInt(e.target.value||"0",10))} disabled={!isPro} />
        </label>
      </div>
      <div className="text-sm">Draws by end of turn: <span className="font-mono">{draws}</span></div>
      <div className="text-lg">Probability: <span className="font-semibold text-emerald-400">{(p*100).toFixed(2)}%</span></div>
    </section>
  );
}
