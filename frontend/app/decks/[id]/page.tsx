// frontend/app/decks/[id]/page.tsx
import type { Metadata, ResolvingMetadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata
): Promise<Metadata> {
  const id = params.id;
  const title = `My Deck • ${id.slice(0, 8)}`;
  const url = `https://manatap.ai/decks/${id}`;
  return {
    title,
    description: "View and manage your deck.",
    openGraph: { title, description: "View and manage your deck.", url, type: "website" },
    twitter: { card: "summary_large_image", title, description: "View and manage your deck." },
    alternates: { canonical: url },
  };
}

export default function Page({ params }: Props) {
  // Intentionally do **no** Supabase I/O here. We fetch in the client
  // so we always have the user's session token and avoid server crashes.
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Client deckId={params.id} />
    </main>
  );
}
