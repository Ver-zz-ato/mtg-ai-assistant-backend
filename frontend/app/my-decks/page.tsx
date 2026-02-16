'use client';

import React, { Suspense, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context"; // NEW: Use push-based auth
import MyDecksList from "@/components/MyDecksList";
import GuestLandingPage from "@/components/GuestLandingPage";
import { NoDecksEmptyState } from "@/components/EmptyState";
import DeckPageCoachBubbles from "./ClientWithCoach";
import CompareDecksWidget from "@/components/CompareDecksWidget";
import ImportDeckModal from "@/components/ImportDeckModal";
import { capture } from "@/lib/ph";

type DeckRow = {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_public: boolean;
};

export default function MyDecksPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading decks…</div>
        </div>
      }
    >
      <MyDecksPageContent />
    </Suspense>
  );
}

function MyDecksPageContent() {
  const supabase = createBrowserSupabaseClient();
  const { user, loading: authLoading } = useAuth(); // NEW: Get auth state from context
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const INITIAL_PAGE_SIZE = 20;
  const [showQuizModal, setShowQuizModal] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);

  const clearImportQuery = useMemo(() => {
    return () => {
      if (!searchParams) return;
      const params = new URLSearchParams(searchParams.toString());
      if (!params.has("action")) return;
      params.delete("action");
      const query = params.toString();
      router.replace(query ? `/my-decks?${query}` : "/my-decks", { scroll: false });
    };
  }, [router, searchParams]);

  const openImportModal = () => {
    try {
      capture("deck_import_modal_opened", { source: "my-decks-header" });
    } catch {}
    setShowImport(true);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("action", "import");
    const query = params.toString();
    router.replace(query ? `/my-decks?${query}` : "/my-decks?action=import", { scroll: false });
  };

  const handleImportClose = () => {
    setShowImport(false);
    clearImportQuery();
  };

  const handleImported = (deckId: string) => {
    clearImportQuery();
    setShowImport(false);
    router.push(`/my-decks/${deckId}?imported=1`);
  };

  useEffect(() => {
    if (searchParams?.get("action") === "import") {
      setShowImport(true);
    }
  }, [searchParams]);

  // Load decks - initial load with pinned first, then paginating the rest
  const decksLoadedRef = useRef(false);
  
  const loadDecks = React.useCallback(async (pageNum: number, append: boolean) => {
    if (!user) return;
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const { data: pp } = await supabase
        .from('profiles_public')
        .select('pinned_deck_ids')
        .eq('id', user.id)
        .maybeSingle();

      const pinned = Array.isArray(pp?.pinned_deck_ids) ? pp.pinned_deck_ids : [];
      setPinnedIds(pinned);

      if (pageNum === 1) {
        // First page: pinned decks + first batch of non-pinned
        const pinnedIds = pinned.filter(Boolean);
        let pinnedDecks: DeckRow[] = [];
        if (pinnedIds.length > 0) {
          const { data: pinnedData } = await supabase
            .from("decks")
            .select("id, title, commander, created_at, updated_at, is_public")
            .eq("user_id", user.id)
            .in("id", pinnedIds);
          pinnedDecks = (pinnedData || []).map((d: any) => ({
            ...d,
            is_public: d.is_public ?? false
          }));
        }

        const excludeIds = pinned.filter(Boolean);
        let nonPinnedQuery = supabase
          .from("decks")
          .select("id, title, commander, created_at, updated_at, is_public")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(0, INITIAL_PAGE_SIZE - 1);

        if (excludeIds.length > 0) {
          nonPinnedQuery = nonPinnedQuery.not("id", "in", `("${excludeIds.join('","')}")`);
        }

        const { data: nonPinnedData } = await nonPinnedQuery;
        const nonPinned = (nonPinnedData || []).map((d: any) => ({
          ...d,
          is_public: d.is_public ?? false
        }));

        const sorted = [...pinnedDecks, ...nonPinned].sort((a: any, b: any) => {
          const ap = pinned.includes(a.id) ? 0 : 1;
          const bp = pinned.includes(b.id) ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return String(b.created_at || '').localeCompare(String(a.created_at || ''));
        });

        setDecks(sorted);
        setHasMore(nonPinned.length === INITIAL_PAGE_SIZE);
      } else {
        // Append: next page of non-pinned
        const excludeIds = pinned.filter(Boolean);
        let query = supabase
          .from("decks")
          .select("id, title, commander, created_at, updated_at, is_public")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range((pageNum - 1) * INITIAL_PAGE_SIZE, pageNum * INITIAL_PAGE_SIZE - 1);

        if (excludeIds.length > 0) {
          query = query.not("id", "in", `("${excludeIds.join('","')}")`);
        }

        const { data: moreData } = await query;
        const more = (moreData || []).map((d: any) => ({
          ...d,
          is_public: d.is_public ?? false
        }));

        setDecks(prev => [...prev, ...more]);
        setHasMore(more.length === INITIAL_PAGE_SIZE);
      }
      decksLoadedRef.current = true;
    } catch (err: any) {
      // Silently fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.id]);

  const lastUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      decksLoadedRef.current = false;
      lastUserIdRef.current = null;
      return;
    }
    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id;
      decksLoadedRef.current = false;
      setPage(1);
      setDecks([]);
    }
    if (decksLoadedRef.current && decks.length > 0 && page === 1) return;
    loadDecks(1, false);
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (page > 1 && user) loadDecks(page, true);
  }, [page]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );
    const currentTarget = observerTarget.current;
    if (currentTarget) observer.observe(currentTarget);
    return () => { if (currentTarget) observer.unobserve(currentTarget); };
  }, [hasMore, loading, loadingMore]);

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
        icon: '📚',
        title: 'Unlimited Deck Building',
        description: 'Create and manage as many decks as you want. Import from popular formats or build from scratch.',
      },
      {
        icon: '🤖',
        title: 'AI-Powered Analysis',
        description: 'Get instant insights on mana curve, synergies, and deck strength powered by advanced AI.',
        highlight: true,
      },
      {
        icon: '💰',
        title: 'Budget Optimization',
        description: 'Find cheaper alternatives without sacrificing synergy. Optimize your deck within your budget.',
      },
      {
        icon: '🎲',
        title: 'Mulligan Simulator',
        description: 'Test your opening hands with our interactive London mulligan simulator using real MTG card art.',
      },
      {
        icon: '📊',
        title: 'Advanced Statistics',
        description: 'Deep dive into probability calculations, combo odds, and deck performance metrics.',
      },
      {
        icon: '📤',
        title: 'Export Anywhere',
        description: 'Export your decks to Moxfield, MTGO, Arena, and other popular MTG platforms.',
      },
    ];

    const demoSection = (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-900/10 dark:to-purple-900/10" />
        <div className="relative">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Powerful Deck Management
          </h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 rounded-lg p-4">
              <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                🔍 Quick Search
              </div>
              <p className="text-blue-700 dark:text-blue-300 text-xs">
                Find any deck instantly with powerful search and filters
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-800/20 rounded-lg p-4">
              <div className="font-semibold text-purple-900 dark:text-purple-200 mb-2">
                📌 Pin Favorites
              </div>
              <p className="text-purple-700 dark:text-purple-300 text-xs">
                Keep your best decks pinned to the top for quick access
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/40 dark:to-green-800/20 rounded-lg p-4">
              <div className="font-semibold text-green-900 dark:text-green-200 mb-2">
                🌐 Share & Publish
              </div>
              <p className="text-green-700 dark:text-green-300 text-xs">
                Make decks public and share them with the community
              </p>
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <GuestLandingPage
        title="Build Better Decks"
        subtitle="Create, analyze, and optimize your Magic: The Gathering decks with AI-powered insights"
        features={features}
        demoSection={demoSection}
        destination="/my-decks"
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {/* Primary: Create Deck - stronger visual presence */}
          <div className="flex-1 md:flex-none">
            {(()=>{ try{ const New = require('@/components/NewDeckInline').default; return <New />; } catch { return null; } })()}
          </div>
          {/* Secondary: Import Deck */}
          <button
            onClick={openImportModal}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:border-neutral-600"
          >
            Import Deck
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading your decks...</div>
      ) : decks.length === 0 ? (
        <NoDecksEmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Deck list */}
          <div className="lg:col-span-2">
            <MyDecksList rows={decks} pinnedIds={pinnedIds} />
            {hasMore && (
              <div ref={observerTarget} className="h-16 flex items-center justify-center py-4">
                {loadingMore && (
                  <span className="flex items-center gap-2 text-gray-400 text-sm">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading more decks...
                  </span>
                )}
              </div>
            )}
          </div>
          
          {/* Right column: Panels and widgets */}
          <div className="lg:col-span-1 space-y-6">
            <CompareDecksWidget />
            
            <div className="space-y-4">
            {/* Start with sample deck */}
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/30">
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Want to try a sample deck?</h3>
                  <p className="text-xs text-gray-400">Import a pre-built Commander deck to explore features</p>
                </div>
                {(()=>{ 
                  try{ 
                    const SampleDeckButton = require('@/components/SampleDeckSelector').SampleDeckButton; 
                    return <SampleDeckButton className="w-full" />; 
                  } catch { 
                    return null; 
                  } 
                })()}
              </div>
            </div>
            
            {/* Find my playstyle widget */}
            {(()=>{ 
              try { 
                const PlaystyleQuizModal = require('@/components/PlaystyleQuizModal').default;
                return (
                  <div className="p-4 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/20 to-pink-900/20">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Not sure where to start?</h3>
                        <p className="text-xs text-gray-400">Find your playstyle and get personalized deck recommendations</p>
                      </div>
                      <button
                        onClick={() => setShowQuizModal(true)}
                        className="relative px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white rounded-xl font-bold text-sm hover:from-purple-500 hover:via-pink-500 hover:to-purple-500 transition-all shadow-xl hover:shadow-purple-500/50 hover:scale-105 transform duration-200 border-2 border-purple-400/50"
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          <span>🎯</span>
                          <span>
                            <span className="block text-yellow-300 text-[10px] font-extrabold uppercase tracking-wider mb-0.5">FIND MY</span>
                            <span className="text-xs">Playstyle</span>
                          </span>
                        </span>
                      </button>
                      {showQuizModal && <PlaystyleQuizModal onClose={() => setShowQuizModal(false)} />}
                    </div>
                  </div>
                );
              } catch { 
                return null; 
              } 
            })()}
            </div>
          </div>
        </div>
      )}

      {(()=>{ 
        try {
          const CreateFAB = require('@/components/CreateDeckFAB').default; 
          return <CreateFAB />;
        } catch (e) {
          return null;
        }
      })()}
      
      <DeckPageCoachBubbles deckCount={decks.length} />

      <ImportDeckModal open={showImport} onClose={handleImportClose} onImported={handleImported} />
    </div>
  );
}
