"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

type DeckRow = {
  id: string;
  title: string | null;
  format: string | null;
  is_public: boolean | null;
  deck_text: string | null;
  created_at: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Client({ deckId }: { deckId: string }) {
  const [deck, setDeck] = React.useState<DeckRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Ensure we have a session; if not, this still works (RLS will deny and we handle it)
        const { data, error } = await supabase
          .from("decks")
          .select("id,title,format,is_public,deck_text,created_at")
          .eq("id", deckId)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          setError("Could not load this deck. It may not exist or you may not have access.");
        } else if (!data) {
          setError("Deck not found.");
        } else {
          setDeck(data as DeckRow);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Unexpected error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [deckId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-2/3 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-white/10" />
        <div className="h-10 w-full animate-pulse rounded bg_white/10" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Deck</h1>
        <p className="text-sm text-red-400">{error}</p>
        <Link className="text-sm underline" href="/my-decks">Back to My Decks</Link>
      </div>
    );
  }

  if (!deck) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{deck.title ?? "Untitled Deck"}</h1>
        <p className="text-sm text-gray-400">
          {deck.format ?? "Unknown format"} • {new Date(deck.created_at ?? "").toLocaleString()}
        </p>
      </header>

      <div className="flex gap-2">
        <Link
          href={`/collections/cost-to-finish?deck=${encodeURIComponent(deck.id)}`}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white/5"
        >
          Open in Cost-to-Finish
        </Link>
        <Link href="/my-decks" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-white/5">
          Back to My Decks
        </Link>
      </div>

      <section>
        <label className="mb-1 block text-sm text-gray-400">Deck text</label>
        <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          {deck.deck_text ?? "(empty)"}
        </pre>
      </section>
    </div>
  );
}
