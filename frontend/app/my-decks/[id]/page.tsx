// app/my-decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import Client from "./Client";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import CopyDecklistButton from "@/components/CopyDecklistButton";
import DeckCsvUpload from "@/components/DeckCsvUpload";
import InlineDeckTitle from "@/components/InlineDeckTitle";
import DeckPublicToggle from "@/components/DeckPublicToggle";

type Params = { id: string };
type Search = { r?: string };

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const { r } = await searchParams;
  const supabase = await createClient();
  const { data: deck } = await supabase.from("decks").select("title").eq("id", id).maybeSingle();
  const title = deck?.title || "Untitled Deck";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <InlineDeckTitle deckId={id} initial={title} />
          <p className="text-xs text-muted-foreground">Deck ID: {id}</p>
        </div>
        <DeckPublicToggle deckId={id} compact />
        <div className="flex items-center gap-2">
          <CopyDecklistButton deckId={id} small />
          <ExportDeckCSV deckId={id} small />
          <DeckCsvUpload deckId={id} />
        </div>
      </header>
      {/* key forces remount when ?r= changes */}
      <Client deckId={id} key={r || "_"} />
    </main>
  );
}
