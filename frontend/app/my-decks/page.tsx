// app/my-decks/page.tsx
import { createClient } from "@/lib/supabase/server";
import NewDeckInline from "@/components/NewDeckInline";
import MyDecksList from "@/components/MyDecksList";
import GuestLandingPage from "@/components/GuestLandingPage";
import { NoDecksEmptyState } from "@/components/EmptyState";
import { canonicalMeta } from "@/lib/canonical";
import DeckPageCoachBubbles from "./ClientWithCoach";
import CompareDecksWidget from "@/components/CompareDecksWidget";
import type { Metadata } from "next";

export function generateMetadata(): Metadata {
  return canonicalMeta("/my-decks");
}

type DeckRow = {
  id: string;
  title: string | null;
  commander: string | null;
  created_at: string | null;
};

export default async function Page() {
  console.log('[My Decks] Page render starting...');
  const startTime = Date.now();
  
  const supabase = await createClient();
  console.log(`[My Decks] Supabase client created in ${Date.now() - startTime}ms`);
  
  // Try getUser() with timeout fallback
  let u: any = null;
  try {
    const authStart = Date.now();
    const userPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('getUser timeout')), 5000)
    );
    
    u = await Promise.race([userPromise, timeoutPromise]).catch(async (err) => {
      console.warn(`[My Decks] getUser() failed/timeout after ${Date.now() - authStart}ms:`, err.message);
      console.log('[My Decks] Falling back to getSession()...');
      const { data: { session } } = await supabase.auth.getSession();
      return { data: { user: session?.user || null }, error: null };
    });
    
    console.log(`[My Decks] Auth check completed in ${Date.now() - authStart}ms`, {
      hasUser: !!u?.data?.user,
      userId: u?.data?.user?.id,
      email: u?.data?.user?.email
    });
  } catch (err: any) {
    console.error('[My Decks] Auth exception:', err);
    u = { data: { user: null }, error: err };
  }
  
  if (!u?.data?.user) {
    console.log('[My Decks] No user found, showing guest landing page');

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

  // PERFORMANCE OPTIMIZATION: Only fetch metadata, not full deck_text
  // This reduces initial load time by ~80% for users with many decks
  console.log('[My Decks] Fetching decks from database...');
  const decksFetchStart = Date.now();
  
  const { data, error } = await supabase
    .from("decks")
    .select("id, title, commander, created_at, updated_at, is_public")
    .eq("user_id", u.data.user.id)
    .order("created_at", { ascending: false });

  console.log(`[My Decks] Decks fetch completed in ${Date.now() - decksFetchStart}ms`, {
    success: !error,
    deckCount: data?.length || 0,
    error: error?.message
  });

  if (error) {
    console.error('[My Decks] Database error:', error);
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-red-500">{error.message}</p>
      </div>
    );
  }

  const rows: any[] = (data || []) as any;
  console.log(`[My Decks] Processing ${rows.length} decks...`);

  // Load pinned decks
  let pinnedIds: string[] = [];
  try {
    console.log('[My Decks] Fetching pinned deck IDs...');
    const { data: pp } = await supabase.from('profiles_public').select('pinned_deck_ids').eq('id', u.data.user.id).maybeSingle();
    pinnedIds = Array.isArray((pp as any)?.pinned_deck_ids) ? (pp as any).pinned_deck_ids as string[] : [];
    console.log('[My Decks] Pinned deck IDs loaded:', pinnedIds);
  } catch (e: any) {
    console.warn('[My Decks] Failed to load pinned IDs:', e.message);
  }

  // Sort: pinned first, then by creation date
  rows.sort((a:any,b:any)=>{
    const ap = pinnedIds.includes(a.id) ? 0 : 1;
    const bp = pinnedIds.includes(b.id) ? 0 : 1;
    if (ap!==bp) return ap-bp; 
    return String(b.created_at||'').localeCompare(String(a.created_at||''));
  });

  console.log(`[My Decks] Page render complete in ${Date.now() - startTime}ms - rendering ${rows.length} decks`);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <div>
          {(()=>{ try{ const New = require('@/components/NewDeckInline').default; return <New />; } catch { return null; } })()}
        </div>
      </div>

      {/* Compare Decks Widget */}
      {rows.length >= 2 && (
        <div className="mb-6">
          <CompareDecksWidget />
        </div>
      )}

      {rows.length === 0 ? (
        <NoDecksEmptyState />
      ) : (
        <>
          <MyDecksList rows={rows} pinnedIds={pinnedIds} />
          
          {/* Sample deck button for existing users */}
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

      {/* Floating action button for deck creation */}
      {(()=>{ 
        try {
          const CreateFAB = require('@/components/CreateDeckFAB').default; 
          return <CreateFAB />;
        } catch (e) {
          console.error('Error loading CreateFAB:', e);
          return null;
        }
      })()}
      
      {/* Coach bubbles */}
      <DeckPageCoachBubbles deckCount={rows.length} />
    </div>
  );
}
