// frontend/app/decks/[id]/page.tsx
import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

// In Next 15, params/searchParams can be Promises in types.
// Accept a Promise and await it in both functions.

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
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

export default async function Page(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Client deckId={id} />
    </main>
  );
}
