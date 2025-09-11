// app/decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import Client from "./Client";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import CopyDecklistButton from "@/components/CopyDecklistButton";

type Params = { id: string };

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const _supabase = await createClient(); // bootstrap session

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Deck</h1>
          <p className="text-xs text-muted-foreground">Deck ID: {id}</p>
        </div>
        <div className="flex items-center gap-2">
          <CopyDecklistButton deckId={id} small />
          <ExportDeckCSV deckId={id} small />
        </div>
      </header>
      <Client deckId={id} />
    </main>
  );
}
