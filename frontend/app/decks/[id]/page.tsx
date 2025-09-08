// frontend/app/decks/[id]/page.tsx
import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

// Keep types simple; let Next infer PageProps shape
export async function generateMetadata(
  { params }: { params: { id: string } }
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

export default function Page(
  { params }: { params: { id: string } }
) {
  // No server-side Supabase calls here
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Client deckId={params.id} />
    </main>
  );
}
