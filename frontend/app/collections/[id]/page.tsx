// app/collections/[id]/page.tsx
import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const id = decodeURIComponent(params.id);
  return {
    title: `Collection • ${id.slice(0, 8)}`,
    description: "View and edit the cards in this collection.",
  };
}

export default function Page({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Client collectionId={id} />
    </main>
  );
}
