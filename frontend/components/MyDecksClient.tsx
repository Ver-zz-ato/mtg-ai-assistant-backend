"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function MyDecksClient({ decks }: { decks: Array<{ id:string; title:string; art?:string; is_public?:boolean; updated_at?:string; created_at?:string }> }){
  const router = useRouter();
  const sp = useSearchParams();
  const deckId = typeof sp?.get === 'function' ? sp.get('deckId') : null;
  const deck = deckId ? decks.find(d=>d.id===deckId) : null;
  // Hooks must be called consistently on every render
  const [vis, setVis] = React.useState<boolean|undefined>(deck?.is_public);
  const [last, setLast] = React.useState<string|undefined>(deck?.updated_at || deck?.created_at);
  const [ctf, setCtf] = React.useState<{ missing:number }|null>(null);
  const [lights, setLights] = React.useState<{ curve?:boolean; color?:boolean; lands?:boolean }|null>(null);

  React.useEffect(()=>{
    if (!deckId) return;
    (async()=>{
      try{
        // Fetch cards -> analyze -> compute lights
        const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        const cards: Array<{ name:string; qty:number }> = Array.isArray(j?.cards)? j.cards : [];
        if(cards.length){
          const deckText = cards.map(c=>`${c.qty||1} ${c.name}`).join('\n');
          const a = await fetch('/api/deck/analyze', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckText, format:'Commander', useScryfall:true }) });
          const aj = await a.json().catch(()=>({}));
          const score = Number(aj?.result?.score||0);
          const bands = aj?.result?.bands||{};
          setLights({ curve: score>=50, color: (bands?.mana||0) >= 0, lands: (bands?.ramp||0) >= 0 });
        }
      } catch{}
      try{
        // Cost to finish summary
        const r2 = await fetch('/api/deck/shopping-list', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ deckId }) });
        const j2 = await r2.json().catch(()=>({}));
        if (r2.ok) setCtf({ missing: Number(j2?.missing||0) });
      } catch{}
    })();
  }, [deckId]);

  React.useEffect(()=>{
    setVis(deck?.is_public);
    setLast(deck?.updated_at || deck?.created_at);
  }, [deck?.id]);

  if (!deck) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Deck details">
      <button className="absolute inset-0 bg-black/50" onClick={()=> router.push('/my-decks', { scroll:false } as any)} aria-label="Close" />
      <div className="absolute right-0 top-0 bottom-0 w-[90vw] sm:w-[520px] bg-neutral-950 border-l border-neutral-800 p-4 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold truncate" title={deck.title}>{deck.title}</div>
            <button onClick={()=> router.push('/my-decks', { scroll:false } as any)} className="text-sm opacity-80">✕</button>
          </div>
          {deck.art && (<div className="h-40 rounded-lg bg-center bg-cover border border-neutral-800" style={{ backgroundImage: `url(${deck.art})` }} />)}
          <div className="flex gap-2">
            <a href={`/my-decks/${encodeURIComponent(deck.id)}`} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm text-white">Open editor</a>
            <a href={`/decks/${encodeURIComponent(deck.id)}`} className="px-3 py-1.5 rounded border border-neutral-700 text-sm">View deck</a>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2"><span className="opacity-70">Visibility:</span><span className="font-mono">{vis? 'Public':'Private'}</span></div>
            <div className="flex items-center gap-2"><span className="opacity-70">Last updated:</span><span className="font-mono">{last? new Date(last).toLocaleString() : '—'}</span></div>
            <div className="flex items-center gap-2"><span className="opacity-70">Cost to Finish:</span><span className="font-mono">{ctf? `${ctf.missing} to buy` : '—'}</span><a href={`/api/deck/shopping-list?deckId=${encodeURIComponent(deck.id)}`} target="_blank" className="text-xs underline">Open →</a></div>
            <div className="flex items-center gap-3">
              <span className="opacity-70">Health:</span>
              <span className={`inline-block w-2 h-2 rounded-full ${lights?.curve? 'bg-emerald-500':'bg-neutral-600'}`} />
              <span className={`inline-block w-2 h-2 rounded-full ${lights?.color? 'bg-emerald-500':'bg-neutral-600'}`} />
              <span className={`inline-block w-2 h-2 rounded-full ${lights?.lands? 'bg-emerald-500':'bg-neutral-600'}`} />
              <span className="text-xs opacity-70">Curve • Color • Lands</span>
            </div>
          </div>
          <div className="text-xs opacity-70">Tip: you can pin up to 3 decks from the list for quick access.</div>
        </div>
      </div>
    </div>
  );
}