// app/collections/page.tsx
"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
// Using cached batch-images API instead of live Scryfall calls
import { useRouter, useSearchParams } from "next/navigation";
import CollectionEditor from "@/components/CollectionEditor";
import CollectionSnapshotDrawer from "@/components/CollectionSnapshotDrawer";
import GuestLandingPage from "@/components/GuestLandingPage";
import { EmptyCollectionsState } from "@/components/EmptyStates";
import { capture } from "@/lib/ph";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import CollectionPageCoachBubbles from "./ClientWithCoach";

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
  // ============ ALL HOOKS AT THE TOP ============
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, Stats | null>>({});
  
  const router = useRouter();
  const sp = useSearchParams();
  // Safely get collectionId from query params
  let qId: string | null = null;
  try {
    qId = sp?.get('collectionId') || null;
  } catch (e) {
    console.error('[Collections] Error reading search params:', e);
  }
  
  // All async functions defined here (before hooks that use them)
  const loadCollections = async () => {
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
              const norm = (s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
              estValueUSD = items.reduce((acc, it) => acc + (prices[norm(it.name)] || 0) * (Number(it.qty) || 0), 0);
              let best = { name: '', score: -1 };
              for (const it of items) {
                const unit = prices[norm(it.name)] || 0; const score = unit * (Number(it.qty)||1);
                if (score > best.score) best = { name: it.name, score };
              }
              coverName = best.name || (items.sort((a,b)=> (b.qty||0)-(a.qty||0))[0]?.name || null);
            }
          } catch {}

          let cover: Stats['cover'] = undefined;
          try {
            const pick = coverName || names[0];
            if (pick) {
              const imageResponse = await fetch('/api/cards/batch-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names: [pick] })
              });
              if (imageResponse.ok) {
                const imageData = await imageResponse.json();
                const card = imageData?.data?.[0];
                if (card?.image_uris) {
                  cover = { 
                    small: card.image_uris.normal || card.image_uris.small, 
                    art: card.image_uris.art_crop 
                  };
                }
              }
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
  };
  
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  };
  
  // Check auth status with timeout
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    
    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.error('[Collections] Auth check timeout - forcing completion');
      setAuthLoading(false);
      setLoading(false); // Also stop main loading if auth times out
    }, 5000);
    
    supabase.auth.getUser()
      .then(({ data, error }) => {
        clearTimeout(timeout);
        if (error) {
          console.error('[Collections] Auth error:', error);
        }
        setUser(data.user);
        setAuthLoading(false);
        
        // If no user, stop loading immediately
        if (!data.user) {
          setLoading(false);
        }
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.error('[Collections] Auth exception:', err);
        setAuthLoading(false);
        setLoading(false); // Stop loading on auth failure
      });
  }, []);
  
  // Load collections only if logged in
  useEffect(() => { 
    if (!authLoading && !user) {
      // Not logged in - stop loading
      setLoading(false);
    } else if (user && !authLoading) {
      // Logged in - load collections
      loadCollections(); 
    }
  }, [user, authLoading]);
  
  // No longer need drawer logic - direct navigation now
  
  // Refresh when returning from editor (bfcache/visibility)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && user) {
        loadCollections();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user]);
  
  // Show guest landing page if not logged in
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }
  
  if (!user) {
    const features = [
      {
        icon: '📦',
        title: 'Track Your Collection',
        description: 'Organize all your Magic cards in one place. Track quantities, conditions, and variants.',
      },
      {
        icon: '💵',
        title: 'Real-Time Pricing',
        description: 'See your collection value with up-to-date pricing from multiple sources.',
        highlight: true,
      },
      {
        icon: '📊',
        title: 'Missing Cards Analysis',
        description: 'Compare your collection against decks to see exactly what you need and what it costs.',
      },
      {
        icon: '📁',
        title: 'CSV Import/Export',
        description: 'Easily import your existing collection from CSV or export for backup and sharing.',
      },
      {
        icon: '✅',
        title: 'Set Completion',
        description: 'Track your progress completing MTG sets and see what cards you still need.',
      },
      {
        icon: '📈',
        title: 'Price History',
        description: 'View price trends over time and get notified of significant value changes.',
      },
    ];

    const demoSection = (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-blue-50/50 dark:from-emerald-900/10 dark:to-blue-900/10" />
        <div className="relative">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
            Powerful Collection Tools
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-4">
                <div className="text-sm font-semibold mb-1">Cost to Finish</div>
                <div className="text-2xl font-bold">$142.50</div>
                <div className="text-xs opacity-90 mt-1">Missing 23 cards from your deck</div>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Collection Value</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">$1,248.75</div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">↑ $15.20 this week</div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-lg p-4">
              <div className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Stats</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total Cards:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">1,842</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Unique Cards:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">643</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Collections:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Last Updated:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">Today</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <GuestLandingPage
        title="Manage Your Collection"
        subtitle="Track, value, and organize your Magic: The Gathering card collection with powerful tools"
        features={features}
        demoSection={demoSection}
      />
    );
  }

  // Functions for collection management
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
    // Use undo toast for confirmation
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    // Store collection data for undo
    const collectionToDelete = collections.find(c => c.id === id);
    
    undoToastManager.showUndo({
      id: `delete-collection-${id}`,
      message: `Deleting collection: ${name}`,
      duration: 8000,
      onUndo: async () => {
        // If we had the collection data, we could restore it here
        // For now, just refresh to show it wasn't deleted
        await loadCollections();
        showToast('Collection deletion cancelled');
      },
      onExecute: async () => {
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
      },
    });
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

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Collections</h1>
        <div className="flex items-center gap-2">
          {/* ALWAYS VISIBLE CSV Upload button */}
          {(()=>{ 
            try {
              const CollectionCsvUpload = require('@/components/CollectionCsvUpload').default;
              // Always uses 'new' mode to create a new collection from CSV
              return <CollectionCsvUpload collectionId="prompt" mode="new" onDone={loadCollections} />;
            } catch {
              return null;
            }
          })()}
        </div>
      </div>
      {nameError && (<p className="text-xs text-red-500 mt-1">{nameError}</p>)}

      {/* Grid */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_,i)=>(<CardSkeleton key={i}/>))}
        </div>
      )}

      {!loading && collections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((c) => {
            const s = stats[c.id];
            const created = c.created_at ? new Date(c.created_at).toLocaleString() : "";
            return (
              <div key={c.id} className="group rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950 flex flex-col hover:border-neutral-600 transition-colors">
                {/* Cover - Clickable */}
                <Link 
                  href={`/collections/${c.id}`}
                  className="relative h-48 w-full overflow-hidden block"
                  onClick={()=>{ try{ capture('collections.card_click', { id: c.id }); } catch{} }}
                >
                  {s?.cover?.art || s?.cover?.small ? (
                    <img src={s?.cover?.art || s?.cover?.small} alt="cover" className="w-full h-full object-cover" />
                  ) : (
                    // Empty state placeholder with gradient and icon
                    <div className="w-full h-full bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-orange-900/20 flex items-center justify-center relative overflow-hidden">
                      {/* Subtle pattern */}
                      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                      
                      {!s || s.totalCards === 0 ? (
                        // No cards: Show "Add cards" CTA
                        <div className="text-center z-10">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-600/20 border-2 border-dashed border-purple-600/40 flex items-center justify-center">
                            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                          <div className="text-sm text-purple-300 font-medium">Add cards to see art</div>
                          <div className="text-xs text-neutral-400 mt-1">Click to start building</div>
                        </div>
                      ) : (
                        // Has cards but no art: Show collection icon
                        <div className="text-center z-10">
                          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-pink-600/20 border-2 border-pink-600/40 flex items-center justify-center">
                            <svg className="w-8 h-8 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                          </div>
                          <div className="text-sm text-pink-300 font-medium">{s.totalCards} cards</div>
                          <div className="text-xs text-neutral-400 mt-1">{s.unique} unique</div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </Link>
                
                {/* Body with expanded stats */}
                <div className="p-4 flex-1 flex flex-col gap-3">
                  {/* Title and Delete */}
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/collections/${c.id}`} className="font-semibold text-base truncate hover:underline flex-1" title={c.name}>{c.name}</Link>
                    <button 
                      onClick={(e)=>{e.preventDefault(); deleteCollection(c.id, c.name);}} 
                      className="text-xs text-red-400 hover:text-red-300 underline opacity-70 hover:opacity-100 transition-opacity"
                    >
                      Delete
                    </button>
                  </div>
                  
                  {/* Main stats - bigger pills */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 border border-blue-600/30 text-blue-300">
                      <span className="opacity-70">Cards:</span> <b className="font-mono ml-1">{s? s.totalCards : '—'}</b>
                    </span>
                    <span className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 border border-purple-600/30 text-purple-300">
                      <span className="opacity-70">Unique:</span> <b className="font-mono ml-1">{s? s.unique : '—'}</b>
                    </span>
                    <span className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-600/30 text-emerald-300">
                      <span className="opacity-70">Value:</span> <b className="font-mono ml-1">{s? `$${s.estValueUSD.toFixed(2)}` : '—'}</b>
                    </span>
                  </div>
                  
                  {/* Updated timestamp */}
                  <div className="text-[10px] opacity-50 mt-auto">
                    Updated: {s?.lastUpdated ? new Date(s.lastUpdated).toLocaleDateString() : created || '—'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && collections.length === 0 && (
        <EmptyCollectionsState />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded bg-black/80 text-white text-xs px-3 py-2 shadow">
          {toast}
        </div>
      )}

      {(()=>{ const CreateFAB = require('@/components/CreateCollectionFAB').default; return <CreateFAB />; })()}
      
      {/* Coach bubble */}
      <CollectionPageCoachBubbles collectionCount={collections.length} />
    </main>
  )
}

export default function CollectionsPageClient(){
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-white">Loading collections...</div>
      </div>
    }>
      <CollectionsPageClientBody />
    </Suspense>
  );
}
