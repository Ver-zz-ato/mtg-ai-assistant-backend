// frontend/app/deck/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Params = { params: { id: string } };

export default async function DeckViewPage({ params }: Params) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Try to fetch: if owner → always; if not owner → must be public
  const { data: deck, error } = await supabase
    .from("decks")
    .select("id, user_id, title, deck_text, is_public, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !deck) return notFound();

  // If not owner and not public → 404
  if (deck.user_id !== user?.id && !deck.is_public) return notFound();

  const created =
    deck.created_at ? new Date(deck.created_at).toLocaleString() : "";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">
          {deck.title || "Untitled Deck"}
        </h1>
        <Link
          href="/my-decks"
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
        >
          My Decks
        </Link>
      </div>

      <div className="text-xs opacity-70 mb-4">
        {deck.is_public ? "Public" : "Private"} • {created}
      </div>

      <pre className="whitespace-pre-wrap rounded-xl border p-4 text-sm bg-black/5">
        {deck.deck_text}
      </pre>
    </main>
  );
}
