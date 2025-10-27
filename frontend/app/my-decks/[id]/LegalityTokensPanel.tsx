"use client";
import React from "react";

export default function LegalityTokensPanel({ deckId }: { deckId: string }) {
  const [open, setOpen] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deckText, setDeckText] = React.useState<string>("");
  const [result, setResult] = React.useState<any | null>(null);
  const [colors, setColors] = React.useState<string[]>([]); // W U B R G

  const toggleColor = (c: string) => setColors(prev => prev.includes(c) ? prev.filter(x=>x!==c) : [...prev, c]);

  async function loadDeckText() {
    setError(null);
    try {
      const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: "no-store" });
      const j = await res.json().catch(()=>({ ok:false }));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || res.statusText);
      const rows = Array.isArray(j.cards) ? j.cards as Array<{ name: string; qty: number }> : [];
      const text = rows.map(it => `${it.qty} ${it.name}`).join("\n");
      setDeckText(text);
      return text;
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch deck cards');
      return '';
    }
  }

  async function analyze() {
    try {
      setLoading(true);
      setError(null);
      const ensureText = deckText || await loadDeckText();
      const body: any = { deckText: ensureText, format: 'Commander', useScryfall: true };
      if (colors.length) body.colors = colors;
      const r = await fetch('/api/deck/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || r.statusText);
      setResult(j);
    } catch (e: any) {
      setError(e?.message || 'Analyze failed');
    } finally { setLoading(false); }
  }

  const copyTokens = () => {
    try {
      const tokens: string[] = Array.isArray(result?.tokenNeeds) ? result.tokenNeeds : [];
      if (!tokens.length) return;
      navigator.clipboard?.writeText?.(tokens.join(', '));
    } catch {}
  };

  const downloadTokens = () => {
    try {
      const tokens: string[] = Array.isArray(result?.tokenNeeds) ? result.tokenNeeds : [];
      const blob = new Blob([tokens.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'token_checklist.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {}
  };

  React.useEffect(() => {
    const h = (e: any) => {
      try { setOpen(true); if (e?.detail?.result) setResult(e.detail.result); } catch {}
    };
    window.addEventListener('legality:open', h as any);
    return () => window.removeEventListener('legality:open', h as any);
  }, []);

  return (
    <section className="mt-6 rounded-xl border border-neutral-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
          <h3 className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-teal-500 bg-clip-text text-transparent">
            Legality & Tokens
          </h3>
        </div>
        <button onClick={() => setOpen(v=>!v)} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="text-sm text-neutral-300">
            Choose colors for color-identity checks:
            <div className="mt-2 flex gap-2">
              {(['W','U','B','R','G'] as const).map(c => (
                <button key={c} onClick={()=>toggleColor(c)} className={`px-2 py-1 rounded text-sm border ${colors.includes(c) ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300' : 'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}>{c}</button>
              ))}
              <button onClick={()=>setColors([])} className="px-2 py-1 rounded text-sm bg-neutral-900 border border-neutral-700">Clear</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={analyze} disabled={loading} className={`px-3 py-1.5 rounded text-sm ${loading ? 'bg-gray-300 text-black' : 'bg-white text-black hover:bg-gray-100'}`}>{loading ? 'Analyzing…' : 'Check Legality & Tokens'}</button>
          </div>

          {error && (<div className="text-sm text-red-400">{error}</div>)}

          {result && (
            <div className="space-y-3 text-sm">
              {(result.bannedCount || 0) > 0 ? (
                <div className="text-red-300">Banned in Commander: <span className="opacity-90">{(result.bannedExamples || []).join(', ')}</span></div>
              ) : (
                <div className="text-neutral-400">No banned cards detected.</div>
              )}

              {(result.illegalByCI || 0) > 0 ? (
                <div className="text-amber-300">Color identity conflicts: <span className="opacity-90">{(result.illegalExamples || []).join(', ')}</span></div>
              ) : (
                <div className="text-neutral-400">No color identity conflicts{colors.length ? '' : ' (select colors to check)'}.</div>
              )}

              {Array.isArray(result.tokenNeeds) && result.tokenNeeds.length > 0 ? (
                <div>
                  <div className="mb-1">Tokens created:</div>
                  <div className="flex flex-wrap gap-2">
                    {result.tokenNeeds.map((t: string) => (<span key={t} className="px-2 py-0.5 rounded bg-neutral-800 text-xs">{t}</span>))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={copyTokens} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Copy list</button>
                    <button onClick={downloadTokens} className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs">Download checklist</button>
                  </div>
                </div>
              ) : (
                <div className="text-neutral-400">No token needs detected.</div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}