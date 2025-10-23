"use client";

import React from "react";
import { useProStatus } from "@/hooks/useProStatus";
import CollectionCsvUpload from "@/components/CollectionCsvUpload";

export default function CollectionHeaderControls({ collectionId }: { collectionId: string }){
  const [isPublic, setIsPublic] = React.useState(false);
  const [slug, setSlug] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [slugOk, setSlugOk] = React.useState<undefined|boolean>(undefined);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/meta`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if(r.ok){ const m=j?.meta??j; setIsPublic(Boolean(m?.is_public)); setSlug(String(m?.public_slug||"")); }
      }catch{}
    })();
  }, [collectionId]);

  React.useEffect(()=>{
    if (!slug) { setSlugOk(undefined); return; }
    const h = setTimeout(async ()=>{
      setChecking(true);
      try{
        const r = await fetch(`/api/collections/slug?slug=${encodeURIComponent(slug)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if(r.ok){ setSlugOk(Boolean(j?.available)); } else { setSlugOk(false); }
      }catch{ setSlugOk(false); }
      finally{ setChecking(false); }
    }, 250);
    return ()=> clearTimeout(h);
  }, [slug]);

  async function togglePublic(){
    if (!isPublic && slug && slugOk === false) return;
    setBusy(true);
    try{
      const body:any = { is_public: !isPublic };
      if(!isPublic){ body.public_slug = slug || `collection-${Date.now()}`; }
      const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/meta`, { method:'PUT', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if(r.ok){ const m=j?.meta??j; setIsPublic(Boolean(m?.is_public)); setSlug(String(m?.public_slug||slug)); }
    }catch{}
    finally{ setBusy(false); }
  }

  const origin = typeof location!=='undefined'? location.origin : '';
  const url = slug? `${origin}/binder/${slug}` : '';

  async function copyLink(){ if(!url) return; try{ await navigator.clipboard.writeText(url); }catch{} }
  function qrSrc(){ if(!url) return ''; const u = encodeURIComponent(url); return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${u}`; }
  async function downloadQR(){ const src = qrSrc(); if(!src) return; try{ const r=await fetch(src); const b=await r.blob(); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`binder-${slug||'qr'}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);}catch{} }

  async function doExport(fmt: 'csv'|'mtga'|'mtgo'|'moxfield'){
    const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/export?format=${fmt}`);
    if(!r.ok) return;
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `collection-${collectionId}.${fmt==='csv'?'csv': fmt==='mtgo'? 'dek' : 'txt'}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 2000);
  }

  const { isPro } = useProStatus();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm opacity-80">Visibility:</span>
        <button onClick={togglePublic} disabled={busy} className={`relative w-11 h-6 rounded-full ${isPublic? 'bg-green-600':'bg-neutral-600'}`} aria-pressed={isPublic} aria-label="toggle public">
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${isPublic? 'translate-x-5':''}`}></span>
        </button>
        <span className={`text-xs ${isPublic?'text-green-400':'opacity-70'}`}>{isPublic? 'Public':'Private'}</span>
      </div>

      {isPublic && (
        <div className="flex items-center gap-2">
          <input aria-invalid={slugOk===false} value={slug} onChange={e=>setSlug(e.target.value)} placeholder="my-binder" className={`w-40 bg-neutral-950 border ${slugOk===false? 'border-red-500':'border-neutral-700'} rounded px-2 py-1 text-xs`} />
          {checking && <span className="text-[11px] opacity-60">Checking…</span>}
          {!checking && slug && slugOk===true && <span className="text-[11px] text-emerald-400">Available</span>}
          {!checking && slug && slugOk===false && <span className="text-[11px] text-red-400">Taken</span>}
          <input readOnly value={url} onFocus={e=>e.currentTarget.select()} className="w-56 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" />
          <button onClick={copyLink} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">Copy</button>
          <img src={qrSrc()} alt="QR" className="w-10 h-10 bg-white rounded border border-neutral-700" />
          <button onClick={downloadQR} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">QR</button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Import */}
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">Import:</span>
          {/* CSV import is free */}
          <CollectionCsvUpload collectionId={collectionId} />
          {/* Advanced imports (PRO) placeholders */}
          {!isPro && (
            <span className="text-[10px] opacity-60" title="PRO only">MTGA/MTGO/Moxfield</span>
          )}
        </div>
        {/* Export */}
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">Export:</span>
          <button onClick={()=>doExport('csv')} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">CSV</button>
          {isPro ? (
            <>
              <button onClick={()=>doExport('mtga')} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">MTGA</button>
              <button onClick={()=>doExport('mtgo')} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">MTGO</button>
              <button onClick={()=>doExport('moxfield')} className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 rounded text-xs">Moxfield</button>
            </>
          ) : (
            <span className="text-[10px] opacity-60" title="PRO only">MTGA/MTGO/Moxfield</span>
          )}
        </div>
      </div>
    </div>
  );
}
