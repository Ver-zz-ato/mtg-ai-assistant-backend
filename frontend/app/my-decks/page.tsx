'use client';

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import MyDecksList from "@/components/MyDecksList";
import GuestLandingPage from "@/components/GuestLandingPage";
import { NoDecksEmptyState } from "@/components/EmptyState";
import DeckPageCoachBubbles from "./ClientWithCoach";
import CompareDecksWidget from "@/components/CompareDecksWidget";

type DeckRow = {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_public: boolean;
};

export default function MyDecksPage() {
  const supabase = createBrowserSupabaseClient(); // MATCH HEADER PATTERN
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Check auth - MATCH HEADER PATTERN EXACTLY
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        const user = session?.user || null;
        
        if (error) {
          console.error('[My Decks] Session error:', error);
        }
        
        setUser(user);
        setAuthLoading(false);
        
        if (!user) {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[My Decks] Auth error:', err);
        setUser(null);
        setAuthLoading(false);
        setLoading(false);
      });
  }, []); // Empty deps - runs once

  // Load decks
  useEffect(() => {
    if (!user || authLoading) return;
    
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
        console.error('[My Decks] Load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, supabase]);

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
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <div>
          {(()=>{ try{ const New = require('@/components/NewDeckInline').default; return <New />; } catch { return null; } })()}
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
          
          <div className="mt-6 p-4 rounded-xl border border-neutral-800 bg-neutral-900/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold mb-1">Want to try a sample deck?</h3>
                <p className="text-xs text-gray-400">Import a pre-built Commander deck to explore features</p>
              </div>
              {(()=>{ 
                try{ 
                  const SampleDeckButton = require('@/components/SampleDeckSelector').SampleDeckButton; 
                  return <SampleDeckButton className="ml-4" />; 
                } catch { 
                  return null; 
                } 
              })()}
            </div>
          </div>
        </>
      )}

      {(()=>{ 
        try {
          const CreateFAB = require('@/components/CreateDeckFAB').default; 
          return <CreateFAB />;
        } catch (e) {
          console.error('Error loading CreateFAB:', e);
          return null;
        }
      })()}
      
      <DeckPageCoachBubbles deckCount={decks.length} />
    </div>
  );
}
