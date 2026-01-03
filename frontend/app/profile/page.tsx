// app/profile/page.tsx
import FeedbackFab from "@/components/FeedbackFab";
import ProfileClient from "./Client";
import GuestLandingPage from "@/components/GuestLandingPage";
import { createClient } from "@/lib/supabase/server";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

export const dynamic = "force-dynamic";

const DEBUG_PROFILE_LOAD = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROFILE === 'true';

function logTiming(label: string, startTime: number) {
  if (DEBUG_PROFILE_LOAD) {
    const elapsed = Date.now() - startTime;
    console.log(`[PROFILE DEBUG] ${label}: ${elapsed}ms`);
  }
}

function norm(s: string) { return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }

async function getDeckArt(sb: any, deckId: string, dbg: { candidates: string[]; method?: 'collection'|'fuzzy'|null }) {
  const startTime = Date.now();
  try {
    const queryStart = Date.now();
    const { data } = await sb.from('decks').select('title, commander, deck_text').eq('id', deckId).maybeSingle();
    logTiming(`getDeckArt: decks query (deckId: ${deckId})`, queryStart);
    
    const list: string[] = [];
    const clean = (s: string) => String(s||'').replace(/\s*\(.*?\)\s*$/, '').trim();
    if (data?.commander) list.push(clean(String(data.commander)));
    if (data?.title) list.push(clean(String(data.title)));
    const lines = String(data?.deck_text||'').split(/\r?\n/).map((l:string)=>l.trim()).filter(Boolean).slice(0,5);
    for (const line of lines) { const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/); list.push(clean(m ? m[2] : line)); }
    
    try {
      const deckCardsStart = Date.now();
      const { data: top } = await sb.from('deck_cards').select('name, qty').eq('deck_id', deckId).order('qty', { ascending: false }).limit(5);
      logTiming(`getDeckArt: deck_cards query (deckId: ${deckId})`, deckCardsStart);
      for (const r of (top as any[]) || []) list.push(clean(String(r.name)));
    } catch (e) {
      if (DEBUG_PROFILE_LOAD) console.error('[PROFILE DEBUG] getDeckArt deck_cards error:', e);
    }
    dbg.candidates = list.slice(0, 50);
    
    // Use cached database lookup instead of direct Scryfall calls
    const batchStart = Date.now();
    const imgMap = await getImagesForNamesCached(list);
    logTiming(`getDeckArt: getImagesForNamesCached (${list.length} candidates)`, batchStart);
    
    // Check cache results (fast path)
    for (const n of list) { 
      const normalized = norm(n);
      const img = imgMap.get(normalized);
      if (img?.art_crop || img?.normal || img?.small) { 
        dbg.method = 'collection'; 
        logTiming(`getDeckArt total (cache match)`, startTime);
        return img.art_crop || img.normal || img.small; 
      } 
    }
    
    // No match found in cache - return undefined (don't block with fuzzy fallback)
    // The cache will handle fetching from Scryfall in background if needed
  } catch (e) {
    if (DEBUG_PROFILE_LOAD) console.error('[PROFILE DEBUG] getDeckArt error:', e);
  }
  dbg.method = null;
  logTiming(`getDeckArt total (no match)`, startTime);
  return undefined;
}

export default async function Page() {
  const pageStartTime = Date.now();
  
  const clientStart = Date.now();
  const sb = await createClient();
  logTiming('createClient()', clientStart);
  
  const authStart = Date.now();
  const { data: ures } = await sb.auth.getUser();
  logTiming('sb.auth.getUser()', authStart);
  const u = ures?.user;
  
  // If not logged in, show guest landing page
  if (!u) {
    const features = [
      {
        icon: '🎨',
        title: 'Showcase Your Collection',
        description: 'Display your MTG collection with style. Set featured decks, favorite commanders, and custom banners.',
      },
      {
        icon: '🏆',
        title: 'Show Off Custom Cards',
        description: 'Create and display your own custom MTG cards. Share your creativity with the community.',
      },
      {
        icon: '📊',
        title: 'Track Your Journey',
        description: 'Keep track of all your decks, collections, and wishlists in one central profile.',
      },
      {
        icon: '🔗',
        title: 'Shareable Profile',
        description: 'Get a unique profile URL to share with friends and showcase your MTG achievements.',
      },
      {
        icon: '⚙️',
        title: 'Customize Everything',
        description: 'Set your signature deck, favorite commander, and personalize your profile settings.',
      },
      {
        icon: '🎯',
        title: 'Badge Collection',
        description: 'Earn badges and achievements as you use ManaTap AI features.',
        highlight: true,
      },
    ];

    return (
      <GuestLandingPage
        title="Your MTG Profile"
        subtitle="Create your personalized Magic: The Gathering profile and showcase your decks, collections, and achievements"
        features={features}
      />
    );
  }
  
  let bannerArt: string | undefined;
  let bannerDebug: { source: string; method: 'collection'|'fuzzy'|null; candidates: string[]; art: string|null } = { source: 'none', method: null, candidates: [], art: null };
  if (u?.id) {
    try {
      const profQueryStart = Date.now();
      const { data: prof } = await sb.from('profiles_public').select('signature_deck_id,favorite_commander').eq('id', u.id).maybeSingle();
      logTiming('profiles_public query', profQueryStart);
      
      const sig = (prof as any)?.signature_deck_id || null;
      const fav = (prof as any)?.favorite_commander || '';
      
      if (sig) { 
        if (DEBUG_PROFILE_LOAD) console.log('[PROFILE DEBUG] Fetching banner art from signature deck:', sig);
        const dbg={candidates:[],method:null as any}; 
        const sigStart = Date.now();
        bannerArt = await getDeckArt(sb, sig, dbg); 
        logTiming('getDeckArt (signature)', sigStart);
        bannerDebug={ source:'signature', method: dbg.method||null, candidates: dbg.candidates, art: bannerArt||null }; 
      }
      
      if (!bannerArt && fav) {
        if (DEBUG_PROFILE_LOAD) console.log('[PROFILE DEBUG] Fetching banner art from favorite commander:', fav);
        bannerDebug = { source:'favorite', method: null, candidates: [String(fav)], art: null };
        try { 
          const favStart = Date.now();
          const imgMap = await getImagesForNamesCached([String(fav)]);
          logTiming(`favorite commander cached fetch (${fav})`, favStart);
          const normalized = norm(String(fav));
          const img = imgMap.get(normalized);
          if (img?.art_crop || img?.normal || img?.small) {
            bannerArt = img.art_crop || img.normal || img.small || undefined;
            bannerDebug.method = 'collection';
            bannerDebug.art = bannerArt||null;
          }
        } catch (e) {
          if (DEBUG_PROFILE_LOAD) console.error('[PROFILE DEBUG] favorite commander fetch error:', e);
        }
      }
      
      if (!bannerArt) {
        if (DEBUG_PROFILE_LOAD) console.log('[PROFILE DEBUG] Fetching banner art from recent deck');
        const recentStart = Date.now();
        const { data: decks } = await sb.from('decks').select('id').eq('user_id', u.id).order('updated_at', { ascending: false }).limit(1);
        logTiming('decks query (recent)', recentStart);
        const first = Array.isArray(decks) && decks[0]?.id ? String(decks[0].id) : '';
        if (first) { 
          const dbg={candidates:[],method:null as any}; 
          const recentDeckStart = Date.now();
          bannerArt = await getDeckArt(sb, first, dbg); 
          logTiming('getDeckArt (recent)', recentDeckStart);
          bannerDebug={ source:'recent', method: dbg.method||null, candidates: dbg.candidates, art: bannerArt||null }; 
        }
      }
    } catch (e) {
      if (DEBUG_PROFILE_LOAD) console.error('[PROFILE DEBUG] Banner art fetch error:', e);
    }
  }
  
  logTiming('PROFILE PAGE TOTAL (server-side)', pageStartTime);
  if (DEBUG_PROFILE_LOAD) console.log('[PROFILE DEBUG] Server-side rendering complete, sending to client');
  return (
    <main className="max-w-none mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-center">My Profile</h1>
      <ProfileClient initialBannerArt={bannerArt||null} initialBannerDebug={bannerDebug} />
      <FeedbackFab />
    </main>
  );
}
