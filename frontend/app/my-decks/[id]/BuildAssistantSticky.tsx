"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

import { encodeBase64Url, decodeBase64Url } from "@/lib/utils/base64url";
function decodeIntentParam(i?: string | null): any {
  if (!i) return null;
  try {
    const json = decodeBase64Url(i);
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' ? obj : null;
  } catch { return null; }
}
function encodeIntentParam(obj: any): string {
  try {
    const json = JSON.stringify(obj || {});
    return encodeBase64Url(json);
  } catch { return ''; }
}

async function toast(msg: string, type: 'success'|'info'|'error' = 'info') {
  try { const { toast, toastError } = await import('@/lib/toast-client'); if (type==='error') toastError(msg); else toast(msg, type==='success'?'success':undefined); }
  catch { try { window.dispatchEvent(new CustomEvent('toast', { detail: msg })); } catch { alert(msg); } }
}

export default function BuildAssistantSticky({ deckId, encodedIntent, isPro }: { deckId: string; encodedIntent?: string | null; isPro: boolean }){
  const router = useRouter();
  const sp = useSearchParams();
  const initial = React.useMemo(()=> decodeIntentParam(encodedIntent), [encodedIntent]);
  const [intent, setIntent] = React.useState<any>(initial || {});
  const [expanded, setExpanded] = React.useState(false); // Start collapsed
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [swapThreshold, setSwapThreshold] = React.useState<{budget: number; currency: string} | null>(null);
  const { showPanel, removeToast } = useToast();

  function chip(label:string){ return (<span className="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900/60 text-[11px]">{label}</span>); }

  function proGuard(): boolean { if (isPro) return true; try { const { showProToast } = require('@/lib/pro-ux'); showProToast(); } catch { alert('This is a Pro feature. Upgrade to unlock.'); } return false; }

  async function fetchDeckRows(): Promise<Array<{ id:string; name:string; qty:number }>> {
    const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
    const j = await r.json().catch(()=>({ ok:false }));
    if (!r.ok || j?.ok===false) throw new Error(j?.error || r.statusText);
    return Array.isArray(j.cards) ? j.cards : [];
  }

  async function getDeckTextAndNames() {
    const rows = await fetchDeckRows();
    const deckText = rows.map((it:any)=>`${it.qty} ${it.name}`).join('\n');
    const names = Array.from(new Set(rows.map((r:any)=>r.name)));
    return { rows, deckText, names };
  }

  function saveConstraints(next: any) {
    setIntent(next);
    try {
      const url = new URL(window.location.href);
      if (next && Object.keys(next||{}).length>0) url.searchParams.set('i', encodeIntentParam(next)); else url.searchParams.delete('i');
      router.replace(url.pathname + url.search);
    } catch {}
  }

  async function checkLegalityAndTokens(ev?: React.MouseEvent) {
    try {
      setBusy('check');
      const { deckText, names } = await getDeckTextAndNames();
      const body:any = { deckText, format: (intent?.format||'Commander'), useScryfall: true };
      if (Array.isArray(intent?.colors) && intent.colors.length>0) body.colors = intent.colors;
      const r = await fetch('/api/deck/analyze', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || r.statusText);
      const banned = Number(j?.bannedCount||0);
      const ci = Number(j?.illegalByCI||0);
      const legalMsg = (banned>0||ci>0) ? `Issues: ${banned} banned, ${ci} CI conflicts` : 'No legality issues';
      // prices snapshot
      const currency = String(intent?.budgetCurrency || intent?.currency || 'USD').toUpperCase();
      const r2 = await fetch('/api/price/snapshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }) });
      const j2 = await r2.json().catch(()=>({ ok:false }));
      const prices: Record<string, number> = (r2.ok && j2?.ok) ? (j2.prices||{}) : {};
      const pricedCount = Object.values(prices).filter((v:any)=>Number(v)>0).length;
      const anchor = ev ? { x: (ev as any).clientX||0, y: (ev as any).clientY||0 } : undefined;
      showPanel({ title: 'Legality check', lines: [ { text: `${legalMsg}` }, { text: `Updated prices for ${pricedCount} cards.` } ], type: (banned||ci)?'warning':'success', anchor, large: true });
      try { window.dispatchEvent(new Event('analyzer:run')); } catch {}
      try { window.dispatchEvent(new CustomEvent('legality:open', { detail: { result: j } })); } catch {}
    } catch (e:any) {
      await toast(e?.message || 'Check failed', 'error');
    } finally { setBusy(null); }
  }

  // --- Simple undo/redo stacks of snapshots ---
  const [history, setHistory] = React.useState<Array<{ before: Array<{name:string;qty:number}>; after: Array<{name:string;qty:number}>; label: string }>>([]);
  const [future, setFuture] = React.useState<typeof history>([]);

  async function snapshot(): Promise<Array<{ name:string; qty:number }>> {
    const rows = await fetchDeckRows();
    return rows.map((r:any)=>({ name: r.name, qty: r.qty }));
  }
  async function applyDiff(from: Array<{name:string;qty:number}>, to: Array<{name:string;qty:number}>) {
    const { computeDiff } = await import('@/lib/assistant/diff');
    const diff = computeDiff(from, to);
    const rows = await fetchDeckRows();
    const byName = new Map(rows.map((r:any)=>[r.name.toLowerCase(), r]));
    for (const e of diff) {
      const nm = e.name;
      const row = byName.get(nm);
      if (row) {
        await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: row.id, delta: e.delta }) });
      } else if (e.delta>0) {
        await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: to.find(x=>x.name.toLowerCase()===nm)?.name || nm, qty: e.delta }) });
      }
    }
    try { window.dispatchEvent(new Event('deck:changed')); } catch {}
  }

  async function doAction(label: string, fn: ()=>Promise<void>) {
    const before = await snapshot();
    await fn();
    const after = await snapshot();
    setHistory(h=>[...h, { before, after, label }]);
    setFuture([]);
  }

  async function undo() {
    if (!isPro || history.length===0) return;
    const last = history[history.length-1];
    await applyDiff(last.after, last.before);
    setHistory(h=>h.slice(0,-1));
    setFuture(f=>[...f, last]);
    await toast(`Undid: ${last.label}`, 'info');
  }
  async function redo() {
    if (!isPro || future.length===0) return;
    const next = future[future.length-1];
    await applyDiff(next.before, next.after);
    setFuture(f=>f.slice(0,-1));
    setHistory(h=>[...h, next]);
    await toast(`Redid: ${next.label}`, 'info');
  }

  async function runBudgetSwaps(budget: number, currency: string, ev?: React.MouseEvent) {
    try {
      setBusy('swaps');
      const { deckText } = await getDeckTextAndNames();
      const r = await fetch('/api/deck/swap-suggestions', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckText, currency, budget, useSnapshot: true, snapshotDate: new Date().toISOString().slice(0,10) }) });
      const j = await r.json().catch(()=>({ ok:false }));
      if (!r.ok || j?.ok===false) throw new Error(j?.error || 'Swap suggestions failed');
      const sugs: Array<{ from:string; to:string; price_from?: number; price_to?: number; price_delta?: number }>= Array.isArray(j?.suggestions)? j.suggestions: [];
      if (!sugs.length) { await toast(`No swaps under ${currency} ${budget} threshold`, 'info'); return; }

    const list = sugs.slice(0, 8);
    const savings = list.reduce((acc, s) => acc + Math.max(0, Number(s.price_from||0) - Number(s.price_to||0)), 0);
    const sym = currency==='EUR'?'€':(currency==='GBP'?'£':'$');

    const anchor = ev ? { x: (ev as any).clientX||0, y: (ev as any).clientY||0 } : undefined;
    const idObj = showPanel({
      title: `Budget swap suggestions — est. savings ${sym}${savings.toFixed(2)} ${currency}`,
      lines: list.map((s, idx) => ({
        id: `swap-${idx}`,
        text: `Swap ${s.from} → ${s.to}`,
        onClick: async () => {
          await doAction(`Swap ${s.from}→${s.to}`, async()=>{
            const rows = await fetchDeckRows();
            const row = new Map(rows.map(r=>[r.name.toLowerCase(), r])).get((s.from||'').toLowerCase());
            if (!row) return;
            await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: row.id, delta: -1 }) });
            await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: s.to, qty: 1 }) });
            try { window.dispatchEvent(new Event('deck:changed')); } catch {}
          });
        },
      })),
      actions: [
        { id: 'approve-all', label: 'Approve all', variant: 'primary', onClick: async ()=>{
          await doAction('Budget swaps (all)', async()=>{
            const rows = await fetchDeckRows();
            const byName = new Map(rows.map(r=>[r.name.toLowerCase(), r]));
            for (const s of sugs.slice(0,8)) {
              const row = byName.get((s.from||'').toLowerCase());
              if (!row) continue;
              await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'PATCH', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: row.id, delta: -1 }) });
              await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: s.to, qty: 1 }) });
            }
            try { window.dispatchEvent(new Event('deck:changed')); } catch {}
          });
          try { removeToast(idObj.id); } catch {}
        }},
        { id: 'close', label: 'Close' }
      ],
      anchor,
      large: true,
    });
    } catch (e:any) {
      await toast(e?.message || 'Budget swaps failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function runBalanceCurve(ev?: React.MouseEvent) {
    const fmt = String(intent?.format || 'Commander');
    const { deckText } = await getDeckTextAndNames();
    const r = await fetch('/api/deck/analyze', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckText, format: fmt, useScryfall: true, colors: Array.isArray(intent?.colors)? intent.colors: [] }) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j?.error || 'Analyze failed');
    const buckets: number[] = Array.isArray(j?.curveBuckets) ? j.curveBuckets : [0,0,0,0,0];
    // Simple heuristics: fill 2-drop and 1-drop deficits; trim 5+ by adding cheaper options instead of remove to keep it non-destructive.
    const adds: string[] = [];
    const colors: string[] = Array.isArray(intent?.colors) ? intent.colors : [];
    const twoDrops = ['Arcane Signet','Fellwar Stone','Talisman of Dominance','Talisman of Curiosity','Talisman of Impulse','Mind Stone'];
    const oneDrops = colors.includes('G') ? ['Llanowar Elves','Elvish Mystic','Birds of Paradise'] : ['Sol Ring'];

    // Optional: enforce color identity for adds
    const onColorOnly = !!intent?.onColorOnly;
    const talismanColors: Record<string, string[]> = {
      'Talisman of Dominance': ['U','B'],
      'Talisman of Curiosity': ['U','G'],
      'Talisman of Impulse': ['R','G'],
    };
    const allowCard = (name: string) => {
      if (!onColorOnly) return true;
      // Colorless ramp allowed everywhere
      if (['Arcane Signet','Mind Stone','Fellwar Stone','Sol Ring'].includes(name)) return true;
      const req = talismanColors[name];
      if (Array.isArray(req) && req.length) {
        const have = new Set(colors.map(c=>c.toUpperCase()));
        return req.every(c=>have.has(c));
      }
      // Green dorks
      if (['Llanowar Elves','Elvish Mystic','Birds of Paradise'].includes(name)) return colors.includes('G');
      return true;
    };
    if (fmt==='Commander') {
      if ((buckets[1]||0) < 12) adds.push(...twoDrops.slice(0, Math.min(2, 12-(buckets[1]||0))));
      if ((buckets[0]||0) < 8) adds.push(...oneDrops.slice(0, Math.min(2, 8-(buckets[0]||0))));
    } else {
      if ((buckets[0]||0) < 10) adds.push(...oneDrops.slice(0, 2));
      if ((buckets[1]||0) < 8) adds.push(...twoDrops.slice(0, 2));
    }

    if (adds.length === 0) { await toast('Curve already looks balanced', 'info'); return; }

    // Enforce on-color filter
    const finalAdds = adds.filter(allowCard);
    if (finalAdds.length === 0) { await toast('No on-color curve suggestions available', 'info'); return; }

    const anchor = ev ? { x: (ev as any).clientX||0, y: (ev as any).clientY||0 } : undefined;
    const idObj = showPanel({
      title: 'Curve balancing suggestions',
      lines: finalAdds.map((nm, idx) => ({ id: `add-${idx}`, text: `Add ${nm}`, onClick: async()=>{
        await doAction(`Add ${nm}`, async()=>{
          await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: nm, qty: 1 }) });
          try { window.dispatchEvent(new Event('deck:changed')); } catch {}
        });
      }})),
      actions: [
        { id: 'approve-all', label: 'Approve all', variant: 'primary', onClick: async ()=>{
          await doAction('Balance curve (all)', async()=>{
            for (const nm of finalAdds) {
              await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name: nm, qty: 1 }) });
            }
            try { window.dispatchEvent(new Event('deck:changed')); } catch {}
          });
          try { removeToast(idObj.id); } catch {}
        }},
        { id: 'close', label: 'Close' },
      ],
      anchor,
      large: true,
    });
  }

  return (
    <section className="sticky top-4 z-10 rounded-xl border border-neutral-800 p-3 bg-neutral-950/95 backdrop-blur shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <div>
            <div className="text-sm font-semibold">Build Assistant</div>
            <div className="text-xs text-gray-400">Smart suggestions for your deck</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded && <button onClick={()=>setEditing(v=>!v)} className="text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded px-3 py-1.5 transition-colors">{editing? '✓ Done':'⚙️ Edit'}</button>}
          <button onClick={()=>setExpanded(v=>!v)} className="text-xs bg-blue-600 hover:bg-blue-500 border border-blue-500 rounded px-3 py-1.5 font-semibold transition-colors">{expanded? '▼ Hide':'▶ Show'}</button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Constraints */}
          <div className="text-[11px]">
            <div className="opacity-80 mb-1">Constraints</div>
            {!editing ? (
              <div className="flex flex-wrap gap-1">
                {intent?.format && chip(`Format: ${String(intent.format).toUpperCase()}`)}
                {Array.isArray(intent?.colors) && intent.colors.length>0 && chip(`Colors: ${intent.colors.join('')}`)}
                {intent?.budget && chip(`Budget: ${intent.budgetCurrency||intent.currency||''}${intent.budget}`)}
                {intent?.plan && chip(`Plan: ${intent.plan}`)}
                {intent?.archetype && chip(`Theme: ${intent.archetype}`)}
                {Array.isArray(intent?.mustInclude) && intent.mustInclude.length>0 && chip(`Must: ${intent.mustInclude.slice(0,2).join(', ')}${intent.mustInclude.length>2?'…':''}`)}
              </div>
            ) : (
              <form className="space-y-2" onSubmit={(e)=>{ e.preventDefault(); setEditing(false); saveConstraints(intent); }}>
                <div className="flex items-center gap-2">
                  <label className="opacity-70 w-20">Format</label>
                  <select value={intent?.format || 'Commander'} onChange={e=>setIntent((p:any)=>({ ...p, format: e.target.value }))} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
                    <option>Commander</option>
                    <option>Modern</option>
                    <option>Pioneer</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="opacity-70 w-20">Colors</label>
                  <div className="flex gap-1">
                    {(['W','U','B','R','G'] as const).map(c => (
                      <button type="button" key={c} onClick={()=>setIntent((p:any)=>{ const cur = Array.isArray(p?.colors)? p.colors: []; const has = cur.includes(c); return { ...p, colors: has? cur.filter((x:string)=>x!==c) : [...cur, c] }; })} className={`px-2 py-1 rounded text-xs border ${Array.isArray(intent?.colors)&&intent.colors.includes(c) ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300' : 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}>{c}</button>
                    ))}
                    <button type="button" onClick={()=>setIntent((p:any)=>({ ...p, colors: [] }))} className="px-2 py-1 rounded text-xs bg-neutral-900 border border-neutral-700">Clear</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="opacity-70 w-20">Budget</label>
                  <input type="number" min={0} step={1} value={Number(intent?.budget||0)} onChange={e=>setIntent((p:any)=>({ ...p, budget: Number(e.target.value||0) }))} className="w-24 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" />
                  <select value={String(intent?.budgetCurrency||intent?.currency||'USD')} onChange={e=>setIntent((p:any)=>({ ...p, budgetCurrency: e.target.value, currency: e.target.value }))} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="opacity-70 w-20">Plan</label>
                  <select value={String(intent?.plan||'Optimized')} onChange={e=>setIntent((p:any)=>({ ...p, plan: e.target.value }))} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1">
                    <option>Optimized</option>
                    <option>Budget</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="opacity-70 w-20">Archetype</label>
                  <input value={String(intent?.archetype||'')} onChange={e=>setIntent((p:any)=>({ ...p, archetype: e.target.value }))} className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-1" placeholder="tokens, control, combo…" />
                </div>
                <div className="flex items-center gap-2">
                  <label className="opacity-70 w-20">On-color adds</label>
                  <input type="checkbox" checked={!!intent?.onColorOnly} onChange={e=>setIntent((p:any)=>({ ...p, onColorOnly: e.target.checked }))} />
                  <span className="text-[10px] opacity-70">Only suggest cards with color identity ⊆ deck colors</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="text-xs border rounded px-2 py-1" onClick={()=>{ setEditing(false); setIntent(initial||{}); saveConstraints(initial||{}); }}>Reset</button>
                  <button type="submit" className="text-xs border rounded px-2 py-1">Save</button>
                </div>
              </form>
            )}
          </div>

          {/* Quick Actions */}
          <div className="text-[11px]">
            <div className="opacity-90 mb-2 font-semibold flex items-center gap-1">
              <span>⚡</span> Quick Actions
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button 
                disabled={busy==='check'} 
                className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 disabled:opacity-60 text-left transition-colors" 
                onClick={(e)=>checkLegalityAndTokens(e)}
              >
                <div className="font-semibold text-xs">✓ Check Legality</div>
                <div className="text-xs opacity-70">Verify format & colors</div>
              </button>
              <button 
                className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-left transition-colors" 
                onClick={(e)=>{ if (!proGuard()) return; runBalanceCurve(e); }}
              >
                <div className="font-semibold text-xs flex items-center gap-1">
                  📊 Balance Curve
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-600/30 text-amber-300">PRO</span>
                </div>
                <div className="text-xs opacity-70">Optimize mana curve</div>
              </button>
              <button 
                disabled={busy==='swaps'}
                className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 disabled:opacity-60 text-left transition-colors" 
                onClick={()=>{ if (!proGuard()) return; setSwapThreshold({ budget: Number(intent?.budget || 5), currency: String(intent?.budgetCurrency || intent?.currency || 'USD').toUpperCase() }); }}
              >
                <div className="font-semibold text-xs flex items-center gap-1">
                  💰 Budget Swaps
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-600/30 text-amber-300">PRO</span>
                </div>
                <div className="text-xs opacity-70">{busy==='swaps' ? 'Computing...' : 'Find cheaper alternatives'}</div>
              </button>
              <button 
                disabled={busy==='analyze'}
                className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 disabled:opacity-60 text-left transition-colors" 
                onClick={async()=>{ if (!proGuard()) return; setBusy('analyze'); try { window.dispatchEvent(new Event('analyzer:run')); await new Promise(r=>setTimeout(r,100)); await toast('Deck stats updated', 'success'); } catch {} finally { setBusy(null); } }}
              >
                <div className="font-semibold text-xs flex items-center gap-1">
                  🔄 Re-analyze
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-600/30 text-amber-300">PRO</span>
                </div>
                <div className="text-xs opacity-70">{busy==='analyze' ? 'Analyzing...' : 'Update deck stats'}</div>
              </button>
            </div>
          </div>

          {/* Undo / Redo (Pro) */}
          <div className="text-[11px]">
            <div className="opacity-80 mb-1">History</div>
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50" disabled={!isPro || history.length===0} onClick={undo}>Undo</button>
              <button className="px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 disabled:opacity-50" disabled={!isPro || future.length===0} onClick={redo}>Redo</button>
              {!isPro && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">Pro</span>)}
            </div>
          </div>
        </div>
      )}

      {/* Budget Swaps Threshold Popup */}
      {swapThreshold && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={()=>setSwapThreshold(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-5 shadow-2xl max-w-sm w-full mx-4" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">💰</span>
              <h3 className="text-lg font-bold bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent">
                Budget Swap Threshold
              </h3>
            </div>
            <p className="text-sm text-neutral-400 mb-4">
              Find cheaper alternatives for cards above this price:
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Maximum card price</label>
                <input 
                  type="number" 
                  min="0" 
                  step="0.5"
                  value={swapThreshold.budget} 
                  onChange={(e)=>setSwapThreshold({...swapThreshold, budget: Number(e.target.value)})}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  placeholder="5.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Currency</label>
                <select 
                  value={swapThreshold.currency} 
                  onChange={(e)=>setSwapThreshold({...swapThreshold, currency: e.target.value})}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button 
                onClick={()=>setSwapThreshold(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={()=>{ const t = swapThreshold; setSwapThreshold(null); runBudgetSwaps(t.budget, t.currency); }}
                disabled={busy==='swaps'}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {busy==='swaps' ? 'Computing...' : 'Go'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
