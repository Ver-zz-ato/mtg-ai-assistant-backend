// frontend/app/my-decks/page.tsx
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type DeckRow = {
  id: string;
  title: string | null;
  is_public: boolean | null;
  created_at: string | null;
};

export default async function MyDecksPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">My Decks</h1>
        <div className="rounded-xl border p-4 text-sm">
          Please sign in to view your decks.
        </div>
      </main>
    );
  }

  const { data: decks, error } = await supabase
    .from('decks')
    .select('id, title, is_public, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">My Decks</h1>
        <div className="rounded-xl border p-4 text-sm text-red-600">
          Error loading decks: {error.message}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">My Decks</h1>

      {!decks || decks.length === 0 ? (
        <div className="rounded-xl border p-4 text-sm">
          You haven’t saved any decks yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {decks.map((d: DeckRow) => {
            const created =
              d.created_at ? new Date(d.created_at).toLocaleString() : '';
            const pub = d.is_public ? 'Public' : 'Private';
            return (
              <li
                key={d.id}
                className="rounded-xl border p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">
                    {d.title || '(Untitled Deck)'}
                  </div>
                  <div className="text-xs opacity-70">
                    {pub} • {created}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/deck/${d.id}`}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
                  >
                    View
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
