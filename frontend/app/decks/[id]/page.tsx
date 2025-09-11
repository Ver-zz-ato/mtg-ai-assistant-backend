// app/decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import Client from "./Client";

type Params = { id: string };

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const _supabase = await createClient(); // kept to ensure cookie/session bootstrap

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Deck</h1>
        <p className="text-xs text-muted-foreground">Deck ID: {id}</p>
      </header>

      <Client deckId={id} />
    </main>
  );
}
