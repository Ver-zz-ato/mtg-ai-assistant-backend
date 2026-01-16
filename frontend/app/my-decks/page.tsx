'use client';

import React, { Suspense, useEffect, useMemo, useState } from "react";
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

  // Load decks
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    (async () => {
      try {
        const { data, error } = await supabase
          .from("decks")
          .select("id, title, commander, created_at, updated_at, is_public")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const { data: pp } = await supabase
          .from('profiles_public')
          .select('pinned_deck_ids')
          .eq('id', user.id)
          .maybeSingle();

        const pinned = Array.isArray(pp?.pinned_deck_ids) ? pp.pinned_deck_ids : [];
        
        const sorted = (data || []).map((d: any) => ({
          ...d,
          is_public: d.is_public ?? false
        })).sort((a: any, b: any) => {
          const ap = pinned.includes(a.id) ? 0 : 1;
          const bp = pinned.includes(b.id) ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return String(b.created_at || '').localeCompare(String(a.created_at || ''));
        });

        setDecks(sorted);
        setPinnedIds(pinned);
      } catch (err: any) {
        // Silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading]);

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
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          {(()=>{ try{ const New = require('@/components/NewDeckInline').default; return <New />; } catch { return null; } })()}
          <button
            onClick={openImportModal}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
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
        <>
          <MyDecksList rows={decks} pinnedIds={pinnedIds} />
          
          <CompareDecksWidget />
          
          <div className="mt-6 space-y-4">
            {/* Start with sample deck */}
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Want to try a sample deck?</h3>
                  <p className="text-xs text-gray-400">Import a pre-built Commander deck to explore features</p>
                </div>
                {(()=>{ 
                  try{ 
                    const SampleDeckButton = require('@/components/SampleDeckSelector').SampleDeckButton; 
                    return <SampleDeckButton className="sm:ml-4" />; 
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
        </>
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
