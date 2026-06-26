"use client";

import React from "react";
import { useProStatus } from "@/hooks/useProStatus";
import CollectionCsvUpload from "@/components/CollectionCsvUpload";
import { toast, toastError } from "@/lib/toast-client";

export default function CollectionHeaderControls({ collectionId }: { collectionId: string }){
  const [isPublic, setIsPublic] = React.useState(false);
  const [slug, setSlug] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [slugOk, setSlugOk] = React.useState<undefined|boolean>(undefined);
  const [checking, setChecking] = React.useState(false);
  const [shareConfirmOpen, setShareConfirmOpen] = React.useState(false);

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
    // Don't validate slug if we're currently toggling (busy state)
    if (busy) return;
    const h = setTimeout(async ()=>{
      setChecking(true);
      try{
        const r = await fetch(`/api/collections/slug?slug=${encodeURIComponent(slug)}&exclude=${encodeURIComponent(collectionId)}`, { cache:'no-store' });
        const j = await r.json().catch(()=>({}));
        if(r.ok){ setSlugOk(Boolean(j?.available)); } else { setSlugOk(false); }
      }catch{ setSlugOk(false); }
      finally{ setChecking(false); }
    }, 250);
    return ()=> clearTimeout(h);
  }, [slug, busy]);

  async function togglePublic(){
    setBusy(true);
    try{
      const body:any = { is_public: !isPublic };
      if(!isPublic){ 
        // When making public: ALWAYS regenerate slug to avoid conflicts
        // Don't use the current slug even if it seems valid - force regeneration
        body.public_slug = `collection-${collectionId.replace(/-/g, '')}`;
        // Clear the slug input so user sees the new generated slug
        setSlug('');
        setSlugOk(undefined);
      } else {
        // When making private: clear the slug to avoid conflicts
        body.public_slug = null;
        setSlug('');
        setSlugOk(undefined);
      }
      const r = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/meta`, { method:'PUT', headers:{ 'content-type':'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if(r.ok){ 
        const m=j?.meta??j; 
        setIsPublic(Boolean(m?.is_public)); 
        const newSlug = String(m?.public_slug||'');
        setSlug(newSlug);
        // Reset slug validation state - clear any errors
        setSlugOk(undefined);
        // If making public, the generated slug should always be available, so mark it as valid
        if (m?.is_public && newSlug) {
          // Small delay to ensure state updates, then mark as available
          setTimeout(() => setSlugOk(true), 100);
        }
        toast(Boolean(m?.is_public) ? "Collection is public." : "Collection is private.", "success");
      } else {
        // Handle error response
        const errorMsg = j?.error || 'Failed to update';
        if (errorMsg.includes('Slug already taken') || errorMsg.includes('already in use')) {
          // If slug conflict (shouldn't happen with collection-{id} format, but handle it), add timestamp
          const timestamp = Date.now().toString(36);
          const retryBody = { is_public: true, public_slug: `collection-${collectionId.replace(/-/g, '')}-${timestamp}` };
          const retryR = await fetch(`/api/collections/${encodeURIComponent(collectionId)}/meta`, { method:'PUT', headers:{ 'content-type':'application/json' }, body: JSON.stringify(retryBody) });
          const retryJ = await retryR.json().catch(()=>({}));
          if(retryR.ok){
            const m=retryJ?.meta??retryJ;
            setIsPublic(Boolean(m?.is_public));
            setSlug(String(m?.public_slug||''));
            setSlugOk(true);
            toast("Collection is public.", "success");
          }
        } else if (String(errorMsg).toLowerCase().includes('please wait')) {
          toast(errorMsg, 'warning');
        } else {
          toastError(errorMsg);
        }
      }
    }catch(e: any){
      toastError(e?.message || 'Failed to update collection visibility');
    }
    finally{ setBusy(false); }
  }

  const origin = typeof location!=='undefined'? location.origin : '';
  const url = slug? `${origin}/binder/${slug}` : '';

  async function copyLink(){ if(!url) return; try{ await navigator.clipboard.writeText(url); toast("Collection link copied.", "success"); }catch{} finally { setShareConfirmOpen(false); } }

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
          {!checking && slug && slugOk===false && <span className="text-[11px] text-red-400">Slug already in use</span>}
          <input readOnly value={url} onFocus={e=>e.currentTarget.select()} className="w-56 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" />
          <button onClick={() => setShareConfirmOpen(true)} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">Copy</button>
        </div>
      )}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {/* Import */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-70">Import:</span>
          {/* CSV import is free */}
          <CollectionCsvUpload collectionId={collectionId} />
          {/* Advanced imports (PRO) placeholders */}
          {!isPro && (
            <span className="text-[10px] opacity-60" title="PRO only">MTGA/MTGO/Moxfield</span>
          )}
        </div>
        {/* Export */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-70">Export:</span>
          <button onClick={()=>doExport('csv')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">CSV</button>
          {isPro ? (
            <>
              <button onClick={()=>doExport('mtga')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">MTGA</button>
              <button onClick={()=>doExport('mtgo')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">MTGO</button>
              <button onClick={()=>doExport('moxfield')} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg">Moxfield</button>
            </>
          ) : (
            <span className="text-[10px] opacity-60" title="PRO only">MTGA/MTGO/Moxfield</span>
          )}
        </div>
      </div>
      {shareConfirmOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-share-confirm-title"
          onClick={() => setShareConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-neutral-950 p-5 text-neutral-100 shadow-2xl shadow-cyan-950/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
              Share collection
            </div>
            <h2 id="collection-share-confirm-title" className="text-xl font-black text-white">
              Share this collection
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-300">
              Public collection links can be viewed by others. Anyone with the link can open the shared binder page.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShareConfirmOpen(false)}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-black text-black transition-colors hover:bg-cyan-300"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
