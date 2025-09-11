// app/my-decks/[id]/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeckPublicToggle from "@/components/DeckPublicToggle";
import Client from "./Client";

type Params = { id: string };

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: ures } = await supabase.auth.getUser();
  const user = ures?.user;
  if (!user) redirect(`/decks/${id}`);

  const { data: deck, error } = await supabase
    .from("decks")
    .select("id, user_id, title, is_public, deck_text, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !deck) redirect(`/decks/${id}`);
  if (deck.user_id !== user.id) redirect(`/decks/${id}`);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">{deck.title ?? "Untitled Deck"}</h1>
          <p className="text-xs text-muted-foreground">Deck ID: {deck.id}</p>
        </div>
        <DeckPublicToggle deckId={deck.id} initialIsPublic={deck.is_public} compact />
      </div>

      <Client deckId={deck.id} />
    </main>
  );
}
