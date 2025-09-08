// app/collections/[id]/page.tsx
import type { Metadata } from "next";
import Client from "./Client";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  return {
    title: `Collection • ${id.slice(0, 8)}`,
    description: "View and edit the cards in this collection.",
  };
}

export default async function Page(
  props: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await props.params;
  const id = decodeURIComponent(raw);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Client collectionId={id} />
    </main>
  );
}
