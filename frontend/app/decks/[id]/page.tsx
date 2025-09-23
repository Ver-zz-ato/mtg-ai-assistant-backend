// app/decks/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import ExportDeckCSV from "@/components/ExportDeckCSV";
import CopyDecklistButton from "@/components/CopyDecklistButton";

type Params = { id: string };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch deck meta (public visibility enforced by RLS)
  const { data: deck } = await supabase.from("decks").select("title, is_public").eq("id", id).maybeSingle();
  const title = deck?.title ?? "Deck";

  // Fetch cards to render a simple read-only list
  const { data: cards } = await supabase
    .from("deck_cards")
    .select("name, qty")
    .eq("deck_id", id)
    .order("name", { ascending: true });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">Deck ID: {id}</p>
        </div>
        <div className="flex items-center gap-2">
          <CopyDecklistButton deckId={id} small />
          <ExportDeckCSV deckId={id} small />
        </div>
      </header>

      <section className="space-y-1">
        {(cards || []).length === 0 ? (
          <div className="text-sm text-muted-foreground">No cards yet.</div>
        ) : (
          <ul className="text-sm">
            {(cards || []).map((c) => (
              <li key={c.name} className="flex items-center gap-2">
                <span className="w-8 text-right tabular-nums">{c.qty}×</span>
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
