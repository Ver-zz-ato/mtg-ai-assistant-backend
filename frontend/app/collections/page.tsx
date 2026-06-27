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
import { useAuth } from "@/lib/auth-context"; // NEW: Use push-based auth
import CollectionPageCoachBubbles from "./ClientWithCoach";
import { handleProStorageLimitPayload } from "@/lib/pro-storage-limit-ui";

// Basic shapes
type Collection = { id: string; name: string; created_at: string | null; hero_card_name?: string | null };

type Stats = {
  totalCards: number;
  unique: number;
  estValueUSD: number; // snapshot estimate
  lastUpdated?: string | null; // max created_at among items
  cover?: { small?: string; art?: string };
};

function CollectionsPageClientBody() {
  // ============ ALL HOOKS AT THE TOP ============
  const supabase = createBrowserSupabaseClient();
  const { user, loading: authLoading } = useAuth(); // NEW: Get auth state from context
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
      
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Failed to load");
      }
      const list: Collection[] = json.collections || [];
      setCollections(list);

      const summaryRes = await fetch('/api/collections/summary', { cache: 'no-store' });
      const summaryJson = await summaryRes.json().catch(() => ({}));
      if (summaryRes.ok && summaryJson?.ok && summaryJson.summaries) {
        setStats(summaryJson.summaries as Record<string, Stats>);
      } else if (list.length) {
        showToast(summaryJson?.error || 'Could not load collection stats');
      }
    } catch (e: any) {
      console.error('[Collections] Load error:', e?.message || e);
      showToast(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };
  
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  };
  
  // Load collections only if logged in
  useEffect(() => {
    if (!authLoading && !user) {
      setLoading(false);
    } else if (user && !authLoading) {
      loadCollections(); 
    }
  }, [user, authLoading]);

  // Deep-link: ?action=import or ?import=true opens the CSV file picker
  useEffect(() => {
    const shouldImport =
      sp?.get('import') === 'true' || sp?.get('action') === 'import';
    if (!shouldImport || authLoading || !user || loading) return;

    window.dispatchEvent(new CustomEvent('open-collection-csv-import'));

    const params = new URLSearchParams(sp?.toString() || '');
    params.delete('import');
    params.delete('action');
    const query = params.toString();
    router.replace(query ? `/collections?${query}` : '/collections', { scroll: false });
  }, [sp, authLoading, user, loading, router]);
  
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
      <main className="mx-auto max-w-7xl p-6 space-y-4">
        <h1 className="text-xl font-semibold">Collections</h1>
        <div className="text-lg text-neutral-400">Loading...</div>
      </main>
    );
  }
  
  if (!user) {
    const features = [
      {
        icon: '📦',
        title: 'Track Your Collection',
        description: 'Organize owned cards, quantities, variants, and prices in one place.',
      },
      {
        icon: '💵',
        title: 'Collection Value',
        description: 'See collection value, price history, and the cards moving your total most.',
        highlight: true,
      },
      {
        icon: '📊',
        title: 'Build From Collection',
        description: 'Turn cards you already own into Commander deck ideas, guided AI builds, or manual brews.',
      },
      {
        icon: '📁',
        title: 'CSV Import And Export',
        description: 'Import existing binders from CSV and export clean backups whenever you need them.',
      },
      {
        icon: '✅',
        title: 'Deck Gap Checks',
        description: 'Compare your collection against decks to see what you already own and what is missing.',
      },
      {
        icon: '📈',
        title: 'Advanced Stats',
        description: 'Review colour pie, type histogram, set spread, and price distribution for each collection.',
      },
    ];

    return (
      <GuestLandingPage
        title="Manage Your Collection"
        subtitle="Track your cards, value your binders, and build playable decks from what you already own."
        features={features}
        destination="/collections"
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
      if (await handleProStorageLimitPayload(json)) return;
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
    <main className="mx-auto max-w-7xl p-6 space-y-4">
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

      {/* Content: grid + sidebar */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_,i)=>(<CardSkeleton key={i}/>))}
        </div>
      )}

      {!loading && collections.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
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
          </div>
          {/* Right sidebar - Build a Deck feature highlight */}
          <aside className="lg:w-[400px] xl:w-[420px] shrink-0">
            <div className="rounded-2xl border-2 border-purple-500/50 bg-gradient-to-br from-purple-950/90 via-indigo-950/70 to-neutral-950 p-6 shadow-xl shadow-purple-500/10 lg:sticky lg:top-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl" aria-hidden>✨</span>
                <h3 className="text-xl font-bold text-white">Build a Deck From Your Collection</h3>
              </div>
              <p className="text-neutral-200 leading-relaxed mb-4">
                Build manually from cards you already own, or use AI to create Commander decks from your collection. Pick any collection below, open it, and click <strong className="text-purple-300">Build a Deck From This Collection</strong>.
              </p>
              <div className="space-y-3 text-sm text-neutral-300 mb-5">
                <p className="font-medium text-purple-200">How it works:</p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 font-bold">1.</span>
                    Open a collection
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 font-bold">2.</span>
                    Build manually from your cards, or use AI (guided, playstyle quiz, or auto-build)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 font-bold">3.</span>
                    Review the AI-generated deck preview, then create or discard
                  </li>
                </ul>
              </div>
              <div className="rounded-lg bg-purple-900/30 border border-purple-500/30 p-3 text-sm text-neutral-200">
                <strong className="text-white">Pro tip:</strong> The more cards in your collection, the better the AI can match your preferences.
              </div>
            </div>
          </aside>
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
      <main className="mx-auto max-w-7xl p-6 space-y-4">
        <h1 className="text-xl font-semibold">Collections</h1>
        <div className="text-lg text-neutral-400">Loading collections...</div>
      </main>
    }>
      <CollectionsPageClientBody />
    </Suspense>
  );
}
