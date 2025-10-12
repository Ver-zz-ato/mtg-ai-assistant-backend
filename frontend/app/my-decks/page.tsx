// app/my-decks/page.tsx
import { createClient } from "@/lib/supabase/server";
import NewDeckInline from "@/components/NewDeckInline";
import MyDecksList from "@/components/MyDecksList";
import { canonicalMeta } from "@/lib/canonical";
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
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-sm">Please sign in to see your decks.</p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("decks")
    .select("id, title, commander, created_at, updated_at, is_public, deck_text")
    .eq("user_id", u.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-4">My Decks</h1>
        <p className="text-red-500">{error.message}</p>
      </div>
    );
  }

  const rows: any[] = (data || []) as any;

  // Load pinned decks
  let pinnedIds: string[] = [];
  try {
    const { data: pp } = await supabase.from('profiles_public').select('pinned_deck_ids').eq('id', u.user.id).maybeSingle();
    pinnedIds = Array.isArray((pp as any)?.pinned_deck_ids) ? (pp as any).pinned_deck_ids as string[] : [];
  } catch {}

  // Load top cards across all user's decks (fallback when deck_text is empty)
  // Sort: pinned first
  rows.sort((a:any,b:any)=>{
    const ap = pinnedIds.includes(a.id) ? 0 : 1;
    const bp = pinnedIds.includes(b.id) ? 0 : 1;
    if (ap!==bp) return ap-bp; return String(b.created_at||'').localeCompare(String(a.created_at||''));
  });

  // Skip complex deck_cards query for now - load this client-side for better performance
  const topByDeck = new Map<string, string[]>();

  // Skip heavy image processing for now - this was causing page hangs
  // TODO: Load images client-side or with streaming for better UX
  const imgMap = new Map(); // Empty map to avoid breaking existing code
  const norm = (s: string) => String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
  
  function cleanName(s: string): string {
    return String(s||'')
      .replace(/\s*\(.*?\)\s*$/, '') // strip parentheticals
      .replace(/^SB:\s*/i, '')         // sideboard prefix common in exports
      .replace(/^[-•]\s*/, '')         // dash/bullet prefix
      .replace(/^"|"$/g, '')          // outer quotes
      .replace(/\s+/g, ' ')
      .trim();
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">My Decks</h1>
        <div>
          {(()=>{ try{ const New = require('@/components/NewDeckInline').default; return <New />; } catch { return null; } })()}
        </div>
      </div>
      <div className="mb-3 text-sm"><a className="underline underline-offset-4" href="/collections/cost-to-finish">Open Cost to Finish →</a></div>

      <MyDecksList rows={rows} pinnedIds={pinnedIds} />

      {/* Right drawer */}
      {(()=>{ 
        try {
          const MyDecksClient = require('@/components/MyDecksClient').default; 
          const decks = rows.map((r:any)=>({ 
            id:r.id, 
            title: (r.title||'Untitled Deck'), 
            is_public: !!r.is_public, 
            updated_at: r.updated_at, 
            created_at: r.created_at, 
            art: undefined // Skip art processing for now
          })); 
          const CreateFAB = require('@/components/CreateDeckFAB').default; 
          return (<><MyDecksClient decks={decks} /><CreateFAB /></>);
        } catch (e) {
          console.error('Error loading components:', e);
          return null;
        }
      })()}
    </div>
  );
}
