"use client";
import React from "react";
import type { CardFrameProps, ProfileCardValue, ArtOption } from "./cardTypes";

export default function CardFrame({ value, mode='view', onChange, artOptions=[], matte, width }: CardFrameProps){
  const [showOverlay, setShowOverlay] = React.useState(false);
  const [filter, setFilter] = React.useState<string>(value.colorHint || '');
  React.useEffect(()=>{ setFilter(value.colorHint || ''); }, [value.colorHint]);
  function setFilterBoth(f:string){ setFilter(f); onChange?.({ colorHint: f as any }); }
  const options = Array.isArray(artOptions) ? artOptions : [];
  const filtered = options.filter(o => !filter || (filter==='L' ? (o.name||'').toLowerCase().includes('plains') : (o.color||'').toUpperCase()===filter));
  const currentArt = value.art?.url || '';
  function handleSelect(idx:number){ const opt = (filtered[idx] || options[idx]); if (opt) onChange?.({ art: { url: opt.url, artist: opt.artist, id: opt.id } }); setShowOverlay(false); }

  // Helpers for art cycling based on current art
  const curIdx = React.useMemo(()=>{
    const base = Array.isArray(options)? options: [];
    return Math.max(0, base.findIndex((o)=> o?.url === currentArt));
  }, [options, currentArt]);
  function nextArt(dir: 1|-1){
    const list = (filtered.length? filtered: options);
    if (!list.length) return;
    let idx = Math.max(0, list.findIndex(o => o.url === currentArt));
    if (idx === -1) idx = 0;
    const nxt = list[(idx + (dir===1?1:-1) + list.length) % list.length];
    if (nxt) onChange?.({ art: { url: nxt.url, artist: nxt.artist, id: nxt.id } });
  }

  const [tight, setTight] = React.useState(false);
  const nameAreaRef = React.useRef<HTMLSpanElement|null>(null);
  React.useEffect(()=>{
    const el = nameAreaRef.current; if (!el) return; const over = el.scrollWidth > el.clientWidth; setTight(over);
  }, [value?.nameParts?.join(' ')]);

  const primary = matte?.primary ?? '#10141b';
  const secondary = matte?.secondary ?? '#0b0f15';
  const bgStyle = {
    background: `radial-gradient(120% 110% at 50% 40%, ${primary} 0% 45%, ${secondary} 85% 100%)`,
    transition: 'background 300ms ease-out'
  } as React.CSSProperties;

  // Neutral MTG-ish base materials per contract
  const materials = React.useMemo(() => ({
    nameBg: 'linear-gradient(#171c25,#121722)',
    typeBg: 'linear-gradient(#171c25,#121722)',
    rulesBg: 'linear-gradient(#161b24,#121722)',
    ptBg: 'linear-gradient(#232b3a,#1b2333)',
    stripTopHighlight: 'inset 0 1px 0 rgba(255,255,255,.08)',
    stripBorder: '#1f2633',
  }), []);

  const showPT = /\bCreature\b/i.test(value.typeLine || '');

  return (
    <div className="relative mx-auto select-none overflow-hidden rounded-2xl" style={{ width: width || 'clamp(300px, 36vw, 560px)', ...bgStyle }}>
      {/* Grain + vignette overlays */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] -z-10" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '3px 3px' }} />
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'radial-gradient(140% 120% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.24) 100%)' }} />
      <div className="rounded-[18px] border-[3px] border-black overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.35)] bg-[linear-gradient(#0f131a,#0b0f15)] p-2 relative z-10" style={{ aspectRatio: '63 / 88', boxShadow: 'inset 0 0 0 1px #1c2330, inset 0 0 0 2px rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,.35)' }}>
        {/* Nameplate */}
        <div className={`absolute left-[5%] right-[5%] top-[3%] h-[8.5%] rounded-md text-slate-100 border px-2 py-1 font-[600] tracking-[.3px] [font-variant:small-caps] truncate flex items-center ${mode==='edit'?'hover:ring-amber-400/20 focus-within:ring-amber-400/30 ring-1 ring-transparent':''} relative`} style={{ background: materials.nameBg, boxShadow: materials.stripTopHighlight, borderColor: materials.stripBorder }}>
<span ref={nameAreaRef} className="truncate flex items-center gap-2 flex-1 min-w-0 overflow-hidden font-serif pr-[22%]" style={{ fontSize: tight? 'clamp(10.6px,1.0vw,14px)' : 'clamp(12px,1.35vw,16px)' }}>
            <span className="inline-flex flex-col items-center gap-0.5">
{mode==='edit' && (<button className="text-[10px] px-1 py-0 rounded bg-black/60 text-white border border-neutral-700 opacity-90 hover:bg-black/70" onClick={()=>{
  const arr = value.nameParts; const presets=["Dr.","Lord","Lady","Captain","Sir","Arch-","Grand","Shadow","Iron","Flame"]; const i=Math.max(0,presets.indexOf(arr[0])); const next=presets[(i+1)%presets.length]; onChange?.({ nameParts: [next, arr[1], arr[2]] as any });
}} aria-label="Cycle prefix">▲</button>)}
              <span className="hover:opacity-90 leading-none" aria-label="Prefix">{value.nameParts?.[0] || '—'}</span>
{mode==='edit' && (<button className="text-[10px] px-1 py-0 rounded bg-black/60 text-white border border-neutral-700 opacity-90 hover:bg-black/70" onClick={()=>{
  const arr = value.nameParts; const presets=["Dr.","Lord","Lady","Captain","Sir","Arch-","Grand","Shadow","Iron","Flame"]; const i=Math.max(0,presets.indexOf(arr[0])); const next=presets[(i+1)%presets.length]; onChange?.({ nameParts: [next, arr[1], arr[2]] as any });
}} aria-label="Cycle prefix">▼</button>)}
            </span>
            <span className="inline-flex flex-col items-center gap-0.5">
{mode==='edit' && (<button className="text-[10px] px-1 py-0 rounded bg-black/60 text-white border border-neutral-700 opacity-90 hover:bg-black/70" onClick={()=>{
  const arr=value.nameParts; const presets=["Dark","Arcane","Thorn","Ember","Frost","Gale"]; const i=Math.max(0,presets.indexOf(arr[1])); const next=presets[(i+1)%presets.length]; onChange?.({ nameParts: [arr[0], next, arr[2]] as any });
}} aria-label="Cycle descriptor">▲</button>)}
              <span className="hover:opacity-90 leading-none" aria-label="Descriptor">{value.nameParts?.[1] || '—'}</span>
{mode==='edit' && (<button className="text-[10px] px-1 py-0 rounded bg-black/60 text-white border border-neutral-700 opacity-90 hover:bg-black/70" onClick={()=>{
  const arr=value.nameParts; const presets=["Dark","Arcane","Thorn","Ember","Frost","Gale"]; const i=Math.max(0,presets.indexOf(arr[1])); const next=presets[(i+1)%presets.length]; onChange?.({ nameParts: [arr[0], next, arr[2]] as any });
}} aria-label="Cycle descriptor">▼</button>)}
            </span>
            <span className="inline-flex flex-col items-center gap-0.5">
{mode==='edit' && (<button className="text-[10px] px-1 py-0 rounded bg-black/60 text-white border border-neutral-700 opacity-90 hover:bg-black/70" onClick={()=>{
  const arr=value.nameParts; const presets=["Destroyer","Whisper","Weaver","Walker","Breaker","Herald"]; const i=Math.max(0,presets.indexOf(arr[2])); const next=presets[(i+1)%presets.length]; onChange?.({ nameParts: [arr[0], arr[1], next] as any });
}} aria-label="Cycle title">▲</button>)}
              <span className="hover:opacity-90 leading-none" aria-label="Title">{value.nameParts?.[2] || '—'}</span>
{mode==='edit' && (<button className="text-[10px] px-1 py-0 rounded bg-black/60 text-white border border-neutral-700 opacity-90 hover:bg-black/70" onClick={()=>{
  const arr=value.nameParts; const presets=["Destroyer","Whisper","Weaver","Walker","Breaker","Herald"]; const i=Math.max(0,presets.indexOf(arr[2])); const next=presets[(i+1)%presets.length]; onChange?.({ nameParts: [arr[0], arr[1], next] as any });
}} aria-label="Cycle title">▼</button>)}
            </span>
          </span>
          {/* Right controls: absolute group pinned to top-right */}
          <span className="absolute right-[6%] top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-sm">
{mode==='edit' && (<button onClick={()=>{
  const presetsA=["Dr.","Lord","Lady","Captain","Sir","Arch-","Grand","Shadow","Iron","Flame"]; const presetsB=["Dark","Arcane","Thorn","Ember","Frost","Gale"]; const presetsC=["Destroyer","Whisper","Weaver","Walker","Breaker","Herald"]; const np:[string,string,string]=[
    presetsA[Math.floor(Math.random()*presetsA.length)],
    presetsB[Math.floor(Math.random()*presetsB.length)],
    presetsC[Math.floor(Math.random()*presetsC.length)],
  ]; onChange?.({ nameParts: np });
}} className="text-base px-2.5 py-0 rounded bg-black/60 text-white/90 border border-neutral-700 opacity-90 hover:opacity-100" title="Randomize name" aria-label="Randomize name">🎲</button>)}
            {/* Cost pips sized relative to card width */}
            <button onClick={mode==='edit'?()=>{ const c=Math.max(0, Math.min(9, Number(value.cost||1))); const next=c>=9?0:c+1; onChange?.({ cost: next }); }:undefined} className="rounded-full grid place-content-center border text-white font-bold shadow-[inset_0_0_0_1px_rgba(69,80,107,.9)]" style={{ background:'radial-gradient(circle at 40% 35%, #3a4662, #27324a 60%, #1b2439 100%)', borderColor:'#45506b', width:'7.5%', aspectRatio:'1 / 1', fontSize:'clamp(10px,1vw,14px)' }} title="Increase generic cost" aria-label="Increase generic cost">{Math.max(0, Math.min(9, Number.isFinite(value.cost as any)?(value.cost as any):1))}</button>
            <button onClick={mode==='edit'?()=>{ const cols: any = ['W','U','B','R','G']; const i = Math.max(0, cols.indexOf(value.colorHint||'W')); onChange?.({ colorHint: cols[(i+1)%cols.length] }); }:undefined} className="inline-flex items-center justify-center rounded-full border bg-[linear-gradient(#2a2f3a,#1b2333)] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]" style={{ borderColor: 'rgba(0,0,0,.35)', width:'7%', aspectRatio:'1 / 1' }} title="Cycle mana color" aria-label="Cycle mana color">
              <img src={`https://svgs.scryfall.io/card-symbols/${(value.colorHint||'C')}.svg`} alt={String(value.colorHint||'C')} style={{ width:'70%', height:'70%' }} />
            </button>
          </span>
        </div>
        {/* Art window */}
        <div className={`absolute left-[6%] right-[6%] top-[14%] h-[49%] rounded-[10px] overflow-hidden bg-neutral-800 border shadow-[inset_0_0_0_2px_rgba(255,255,255,.04)] ${mode==='edit'?'hover:ring-amber-400/20 focus-within:ring-amber-400/30 ring-1 ring-transparent':''}`} style={{ borderColor: '#1f2633' }} tabIndex={mode==='edit'?0:undefined} onKeyDown={(e)=>{ if(mode!=='edit') return; if(e.key==='ArrowLeft') { e.preventDefault(); nextArt(-1); } else if(e.key==='ArrowRight'){ e.preventDefault(); nextArt(1);} }} aria-label="Change art (Left/Right to cycle)">
          {/* Art credit bottom-right */}
          {(value.art?.artist || undefined) ? (
          <div className="absolute bottom-[6%] right-[8%] text-[10px] bg-black/55 px-1 py-0.5 rounded pointer-events-auto">
              Art: {value.art.artist||'Unknown'} • {value.art?.id ? (<a href={value.art.id} target="_blank" rel="noreferrer" title="View on Scryfall" className="underline">via Scryfall</a>) : 'via Scryfall'}
            </div>
          ) : null}
          {currentArt ? (
            <>
              <img src={currentArt} alt="art" className="w-full h-full object-cover cursor-pointer" onClick={()=>{ if(mode==='edit'){ setShowOverlay(true); } }} />
              {mode==='edit' && (
                <>
                  <button aria-label="Previous art" className="absolute left-1 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-sm px-2 py-1 rounded" onClick={(e)=>{ e.stopPropagation(); nextArt(-1); }}>{'‹'}</button>
                  <button aria-label="Next art" className="absolute right-1 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-sm px-2 py-1 rounded" onClick={(e)=>{ e.stopPropagation(); nextArt(1); }}>{'›'}</button>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full grid place-content-center text-xs opacity-60 cursor-pointer" onClick={()=>{ if(mode==='edit'){ setShowOverlay(true); } }}>No art</div>
          )}
          {/* Bottom filter chips inside overlay footer per spec: moved to overlay footer */}
          {/* Overlay: filmstrip selector */}
          {mode==='edit' && showOverlay && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-[1px] grid grid-rows-[auto,1fr,auto]" role="dialog" aria-label="Select art">
              <div className="px-2 py-1 text-[11px] text-neutral-200 flex items-center justify-between">
                <span>Select art</span>
                <button className="text-xs opacity-80 hover:opacity-100" onClick={()=>setShowOverlay(false)}>✕</button>
              </div>
              <div className="relative px-2 py-1 grid grid-cols-5 gap-1 overflow-y-auto" style={{ contain: 'paint' }}>
                {/* Edge arrows */}
                <button aria-label="Prev art" className="absolute left-1 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-sm px-2 py-1 rounded" onClick={()=>nextArt(-1)}>{'‹'}</button>
                <button aria-label="Next art" className="absolute right-1 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-sm px-2 py-1 rounded" onClick={()=>nextArt(1)}>{'›'}</button>
                {(filtered.length?filtered:options).slice(0,10).map((o, i) => (
                  <button key={`${o.url}-${i}`} onClick={()=>handleSelect(i)} className="relative border border-neutral-700 rounded overflow-hidden hover:border-emerald-400">
                    <img src={o.url} alt={o.name||''} className="w-full h-16 object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 text-[9px] bg-black/60 px-1 truncate">{o.name||''}</div>
                  </button>
                ))}
              </div>
              <div className="px-2 py-1 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {['W','U','B','R','G','C','L'].map(k => (
                    <button key={k} onClick={()=>setFilterBoth(filter===k? '' : k)} title={`Filter ${k}`} className={`text-[10px] px-2 py-0.5 rounded border ${filter===k?'bg-emerald-600 text-white border-emerald-400':'bg-neutral-800 text-white border-neutral-700'}`}>{k}</button>
                  ))}
                </div>
                <div className="text-[10px] opacity-70">{filter?`Filter: ${filter}`:'All art'}</div>
              </div>
            </div>
          )}
        </div>
        {/* Type line strip */}
        <div className={`absolute left-[6%] right-[6%] top-[64%] h-[7%] rounded-md text-slate-100 border px-2 py-1 text-[11px] flex items-center gap-2 ${mode==='edit'?'hover:ring-amber-400/20 focus-within:ring-amber-400/30 ring-1 ring-transparent':''} relative`} style={{ background: materials.typeBg, boxShadow: materials.stripTopHighlight, borderColor: materials.stripBorder }}>
          <span className="flex-1 font-serif [font-variant:small-caps]" style={{ fontSize: 'clamp(11px,1.1vw,14px)' }}>{value.typeLine || '—'}</span>
          {mode==='edit' && (
            <button className="absolute top-1 right-1 text-base px-2.5 py-0 rounded bg-black/60 text-white/90 border border-neutral-700 opacity-90 hover:opacity-100" onClick={()=>{
              const types=['Creature','Artifact','Enchantment','Sorcery','Instant','Planeswalker']; const subs=['Troll','Wizard','Rogue','Knight','Angel','Dragon']; const t = types[Math.floor(Math.random()*types.length)]; const s = subs[Math.floor(Math.random()*subs.length)]; onChange?.({ typeLine: `${t} — ${s}` });
            }} aria-label="Randomize type line" title="Randomize type line">🎲</button>
          )}
        </div>
        {/* Rules/Subtext box */}
        <div className={`absolute left-[6%] right-[6%] top-[72%] h-[16%] rounded-md border p-2 text-slate-100 ${mode==='edit'?'hover:ring-amber-400/20 focus-within:ring-amber-400/30 ring-1 ring-transparent':''}`} style={{ background: materials.rulesBg, borderColor: materials.stripBorder }}>
          <div className="text-[#e9eef9] leading-tight font-serif" style={{ fontSize: 'clamp(11px,1.05vw,13px)' }}>{value.subtext || '—'}</div>
          {mode==='edit' && (
            <button onClick={()=>{ const pool=["Feeds on treasure and overconfidence.","Prefers symmetry—if you can survive it.","Writes contracts in blood and tiny print.","Dreams in turn-three and two-land keeps.","Always has the second spell."]; const sub = pool[Math.floor(Math.random()*pool.length)]; onChange?.({ subtext: sub }); }} className="absolute top-1 right-1 text-base leading-none px-2 py-0 rounded bg-black/60 text-white/90 border border-neutral-700 opacity-90 hover:opacity-100" title="Reroll tagline" aria-label="Reroll tagline">🎲</button>
          )}
        </div>
        {/* P/T box bottom-right of the card */}
        {showPT && value.pt ? (
          <div className="absolute" style={{ right: '6%', bottom: '6%', height: '9%', width: '18%' }}>
            <div className="relative h-full w-full flex items-center justify-center gap-1 px-2 rounded-md text-white font-bold" style={{ background: materials.ptBg, boxShadow: 'inset 0 0 0 1px #3a4356', border: '1px solid #1f2633' }} aria-label="Power/Toughness" tabIndex={mode==='edit'?0:undefined} onKeyDown={(e)=>{
              if(mode!=='edit') return; if(e.key==='ArrowUp'){ e.preventDefault(); const p=(value.pt?.p||1)%9+1; onChange?.({ pt: { p, t: value.pt?.t||1 } as any }); } else if(e.key==='ArrowDown'){ e.preventDefault(); const t=(value.pt?.t||1)%9+1; onChange?.({ pt: { p: value.pt?.p||1, t } as any }); }
            }}>
              <span className="absolute top-1 right-1">
                {mode==='edit' && (<button className="text-xs px-1 py-0 rounded bg-black/60 text-white/90 border border-neutral-700" title="Reroll P/T" aria-label="Reroll P/T" onClick={()=>{ const p=(Math.floor(Math.random()*9)+1); const t=(Math.floor(Math.random()*9)+1); onChange?.({ pt: { p, t } as any }); }}>🎲</button>)}
              </span>
              {mode==='edit' && (<button className="px-1 text-xs" onClick={()=>{ const p=(value.pt?.p||1)%9+1; onChange?.({ pt: { p, t: value.pt?.t||1 } as any }); }} aria-label="Increase power">{value.pt?.p ?? 1}</button>)}
              {!mode || mode==='view' ? <span>{value.pt?.p ?? 1}</span> : null}
              <span>/</span>
              {mode==='edit' && (<button className="px-1 text-xs" onClick={()=>{ const t=(value.pt?.t||1)%9+1; onChange?.({ pt: { p: value.pt?.p||1, t } as any }); }} aria-label="Increase toughness">{value.pt?.t ?? 1}</button>)}
              {!mode || mode==='view' ? <span>{value.pt?.t ?? 1}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
      {/* Disclaimer below the card frame */}
      <div className="mt-1.5 text-center text-[10px] text-neutral-400 opacity-80 select-none">This fan‑made card is fictional and not affiliated with Wizards of the Coast or Scryfall.</div>
    </div>
  );
}
