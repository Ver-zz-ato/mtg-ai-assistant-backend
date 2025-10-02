// app/collections/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { getImagesForNames } from "@/lib/scryfall";
import { useRouter, useSearchParams } from "next/navigation";
import CollectionEditor from "@/components/CollectionEditor";
import CollectionSnapshotDrawer from "@/components/CollectionSnapshotDrawer";
import { capture } from "@/lib/ph";

// Basic shapes
type Collection = { id: string; name: string; created_at: string | null };

type Stats = {
  totalCards: number;
  unique: number;
  estValueUSD: number; // snapshot estimate
  lastUpdated?: string | null; // max created_at among items
  cover?: { small?: string; art?: string };
};

function CollectionsPageClientBody() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Per-collection stats map
  const [stats, setStats] = useState<Record<string, Stats | null>>({});
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerItems, setDrawerItems] = useState<Record<string, Array<{ name: string; qty: number }>>>({});
  const [drawerBusy, setDrawerBusy] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  }

  async function loadCollections() {
    setLoading(true);
    try {
      const res = await fetch("/api/collections/list", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to load");
      const list: Collection[] = json.collections || [];
      setCollections(list);

      // Kick off stats fetch in the background per collection
      list.forEach(async (c) => {
        try {
          const r = await fetch(`/api/collections/cards?collectionId=${encodeURIComponent(c.id)}`, { cache: "no-store" });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j?.ok === false) throw new Error(j?.error || "cards_failed");
          const items: Array<{ name: string; qty: number; created_at?: string }> = j.items || [];

          const totalCards = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
          const unique = items.length;
          const lastUpdated = items.length ? (items.map(i => i.created_at || '').filter(Boolean).sort().pop() || null) : null;

          // Price snapshot
          const names = Array.from(new Set(items.map((it) => it.name)));
          let estValueUSD = 0;
          let coverName: string | null = null;
          try {
            if (names.length) {
              const pr = await fetch('/api/price/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ names, currency: 'USD' }) });
              const pj = await pr.json().catch(()=>({}));
              const prices: Record<string, number> = (pr.ok && pj?.ok) ? (pj.prices || {}) : {};
              // normalize key fn (same as server)
              const norm = (s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
              estValueUSD = items.reduce((acc, it) => acc + (prices[norm(it.name)] || 0) * (Number(it.qty) || 0), 0);
              // Pick cover by most expensive card if any; else by highest qty
              let best = { name: '', score: -1 };
              for (const it of items) {
                const unit = prices[norm(it.name)] || 0; const score = unit * (Number(it.qty)||1);
                if (score > best.score) best = { name: it.name, score };
              }
              coverName = best.name || (items.sort((a,b)=> (b.qty||0)-(a.qty||0))[0]?.name || null);
            }
          } catch {}

          // Images for cover
          let cover: Stats['cover'] = undefined;
          try {
            const pick = coverName || names[0];
            if (pick) {
              const m = await getImagesForNames([pick]);
              const info = m.get(pick.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim());
              cover = { small: info?.normal || info?.small, art: info?.art_crop };
            }
          } catch {}

          setStats((prev) => ({ ...prev, [c.id]: { totalCards, unique, estValueUSD, lastUpdated, cover } }));
        } catch {
          setStats((prev) => ({ ...prev, [c.id]: null }));
        }
      });
    } catch (e: any) {
      showToast(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  const router = useRouter();
  const sp = useSearchParams();
  const qId = typeof sp?.get === 'function' ? sp.get('collectionId') : null;
  useEffect(() => { loadCollections(); }, []);
  // Open drawer from query param
  useEffect(()=>{ if(qId && !drawerId){ setDrawerId(qId); try{ capture('collections.drawer_open', { id: qId }); } catch{} } }, [qId]);

  async function createCollection() {
    setNameError(null);
    const name = (newName || "").trim();
    if (!name) return;
    try {
      const res = await fetch("/api/collections/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) { 
        const msg = (json?.error || "Create failed"); 
        setNameError(String(msg)); 
        throw new Error(msg); 
      }
      setNewName(""); 
      setNameError(null);
      await loadCollections();
      showToast("Collection created");
    } catch (e: any) {
      showToast(e?.message || "Create failed");
    }
  }

  async function deleteCollection(id: string, name: string) {
    const typed = prompt(`Type the collection name to delete: ${name}`);
    if (!typed || typed.trim() !== name.trim()) return;
    try {
      const res = await fetch("/api/collections/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Delete failed");
      await loadCollections();
      showToast("Deleted");
    } catch (e: any) {
      showToast(e?.message || "Delete failed");
    }
  }

  function CardSkeleton(){
    return (
      <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950 animate-pulse">
        <div className="h-32 bg-neutral-900" />
        <div className="p-3 space-y-2">
          <div className="h-4 w-2/3 bg-neutral-900 rounded" />
          <div className="flex gap-1">
            <div className="h-4 w-16 bg-neutral-900 rounded" />
            <div className="h-4 w-20 bg-neutral-900 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Refresh when returning from editor (bfcache/visibility)
  useEffect(()=>{ const onVis=()=>{ if(document.visibilityState==='visible'){ loadCollections(); } }; window.addEventListener('visibilitychange', onVis); return ()=>window.removeEventListener('visibilitychange', onVis); }, []);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Collections</h1>
        <Link href="/collections/cost-to-finish" className="text-sm underline underline-offset-4 hidden sm:block">Open Cost to Finish →</Link>
      </div>
      {nameError && (<p className="text-xs text-red-500 mt-1">{nameError}</p>)}

      {/* Grid */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_,i)=>(<CardSkeleton key={i}/>))}
        </div>
      )}

      {!loading && collections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {collections.map((c) => {
            const s = stats[c.id];
            const created = c.created_at ? new Date(c.created_at).toLocaleString() : "";
            return (
              <div key={c.id} className="group rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950 flex flex-col">
                {/* Cover */}
                <div
                  className="relative h-32 w-full overflow-hidden text-left cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); setDrawerId(c.id); router.push(`/collections?collectionId=${encodeURIComponent(c.id)}`, { scroll:false } as any); try{ capture('collections.drawer_open', { id: c.id }); } catch{} } }}
                  onClick={async()=>{ setDrawerId(c.id); router.push(`/collections?collectionId=${encodeURIComponent(c.id)}`, { scroll:false } as any); try{ capture('collections.drawer_open', { id: c.id }); } catch{} }}
                >
                  {s?.cover?.art || s?.cover?.small ? (
                    <img src={s?.cover?.art || s?.cover?.small} alt="cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
                  )}
                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                  <div className="absolute right-2 bottom-2 hidden group-hover:flex gap-2">
                    <Link href={`/collections/${c.id}`} className="px-2 py-1 rounded bg-neutral-900/90 text-xs border border-neutral-700">Edit</Link>
                    {(()=>{ const Menu = require('@/components/CollectionCardMenu').default; return (<Menu id={c.id} name={c.name} />); })()}
                  </div>
                </div>
                {/* Body */}
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/collections/${c.id}`} className="font-medium truncate hover:underline" title={c.name}>{c.name}</Link>
                    <div className="flex items-center gap-2">
                      <Link href={`/collections/${c.id}`} className="text-xs underline opacity-80 hover:opacity-100">Edit</Link>
                      <button onClick={()=>deleteCollection(c.id, c.name)} className="text-xs text-red-400 underline opacity-80 hover:opacity-100">Delete</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">Cards: <b className="font-mono">{s? s.totalCards : '—'}</b></span>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">Unique: <b className="font-mono">{s? s.unique : '—'}</b></span>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">Value: <b className="font-mono">{s? `$${s.estValueUSD.toFixed(2)}` : '—'}</b></span>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800">Updated: <b className="font-mono">{s?.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString() : '—'}</b></span>
                  </div>
                  <div className="text-[10px] opacity-60">Created {created || '—'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && collections.length === 0 && (
        <div className="rounded-xl border p-4 text-sm">No collections yet.</div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded bg-black/80 text-white text-xs px-3 py-2 shadow">
          {toast}
        </div>
      )}

      {/* Right drawer */}
      {drawerId && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Collection details">
          <button className="absolute inset-0 bg-black/50" onClick={()=>{ setDrawerId(null); router.push('/collections', { scroll:false } as any); }} aria-label="Close" />
          <div className="absolute right-0 top-0 bottom-0 w-[90vw] sm:w-[520px] bg-neutral-950 border-l border-neutral-800 p-4 overflow-y-auto">
            {(() => { const c = collections.find(x=>x.id===drawerId); if (!c) return null; return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold truncate" title={c.name}>{c.name}</div>
                  <div className="flex items-center gap-2">
                    <Link href={`/collections/${c.id}`} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm text-white">Edit collection</Link>
                    <button onClick={()=>{ setDrawerId(null); router.push('/collections', { scroll:false } as any); }} className="text-sm opacity-80">✕</button>
                  </div>
                </div>
                {/* Drawer: lightweight snapshot tools only */}
                <CollectionSnapshotDrawer collectionId={c.id} />
              </div>
            ); })()}
          </div>
        </div>
      )}
      {(()=>{ const CreateFAB = require('@/components/CreateCollectionFAB').default; return <CreateFAB />; })()}
    </main>
  )
}

export default function CollectionsPageClient(){
  return (
    <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading…</div>}>
      <CollectionsPageClientBody />
    </Suspense>
  );
}
