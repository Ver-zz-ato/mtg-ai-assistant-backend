export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type DeckRow = {
  id: string;
  title?: string | null;
  name?: string | null;
  format?: string | null;
  commander?: string | null;
  is_public?: boolean | null;
  deck_text?: string | null;
  data?: any | null;
  meta?: any | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function pickTitle(d: DeckRow) {
  return d.title ?? d.name ?? d.meta?.title ?? "Untitled deck";
}

function pickCommander(d: DeckRow) {
  return (
    d.commander ??
    d.meta?.commander ??
    d.meta?.leader ??
    d.meta?.general ??
    d.data?.commander ??
    d.data?.leaders?.[0] ??
    null
  );
}

function pickDeckText(d: DeckRow) {
  return d.deck_text ?? d.meta?.deck_text ?? d.data?.text ?? "";
}

export default async function PublicDeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();// RLS allows SELECT when is_public = true. Unauthed is fine here.
  const { data, error } = await supabase
    .from("decks")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-xl font-semibold">Deck not found</h1>
        <p className="text-sm opacity-80">
          It might be private or the link is incorrect.
        </p>
        <Link href="/my-decks" className="underline underline-offset-4 text-sm">
          ← My Decks
        </Link>
      </div>
    );
  }

  const row = data as DeckRow;
  if (!row.is_public) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-xl font-semibold">This deck is private</h1>
        <p className="text-sm opacity-80">
          Ask the owner to make it public to share it.
        </p>
        <Link href="/my-decks" className="underline underline-offset-4 text-sm">
          ← My Decks
        </Link>
      </div>
    );
  }

  const title = pickTitle(row);
  const commander = pickCommander(row);
  const deckText = pickDeckText(row);
  const created = row.created_at ? new Date(row.created_at).toLocaleString() : "";

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{title}</h1>
          <div className="text-sm opacity-80">
            {(row.format ?? "Commander") + (commander ? ` • ${commander}` : "")}
          </div>
          {created && <div className="text-xs opacity-60">{created}</div>}
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href={`/collections/cost-to-finish?deck=${encodeURIComponent(row.id)}`}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5"
            title="Estimate missing-cost vs your collection"
          >
            Cost to Finish →
          </Link>
          <Link
            href="/"
            className="rounded-lg border px-3 py-2 text-sm hover:bg-black/5"
            title="Open chat"
          >
            Chat
          </Link>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="text-xs opacity-70 mb-2">Decklist</div>
        <pre className="whitespace-pre-wrap text-sm">{deckText || "—"}</pre>
      </div>

      <div className="text-xs opacity-60">
        Not affiliated with Wizards of the Coast. Card names &amp; game terms are
        property of their respective owners.
      </div>
    </div>
  );
}
