"use client";
import React from "react";

export default function SearchNLWidget() {
  const [q, setQ] = React.useState("");
  const [res, setRes] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/search/scryfall-nl?q=${encodeURIComponent(q)}`);
      const j = await r.json().catch(()=>({}));
      setRes(j);
    } finally { setBusy(false); }
  }
  return (
    <div className="rounded border border-neutral-800 p-2 text-sm">
      <div className="font-medium mb-1">NL → Scryfall</div>
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="e.g. cheap white instant draw cmc<=2" className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1" />
        <button onClick={run} disabled={busy || !q.trim()} className="px-2 py-1 rounded bg-blue-700 text-white disabled:opacity-50">Go</button>
      </div>
      {res?.ok && (
        <div className="mt-2 text-xs">
          <div className="opacity-70">Query: <code className="px-1 py-[1px] rounded bg-neutral-900 border border-neutral-700">{res.scryfall_query}</code></div>
          <div className="mt-1 flex flex-wrap gap-2">
            {(res.results||[]).map((c:any,i:number)=>(
              <div key={i} className="flex items-center gap-2 border border-neutral-700 rounded px-2 py-1">
                {c.image && (<img src={c.image} alt={c.name} width={36} height={52} className="rounded" />)}
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="opacity-70">{c.type_line}</div>
                  <a className="underline" href={c.scryfall_uri} target="_blank" rel="noreferrer">Scryfall</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}