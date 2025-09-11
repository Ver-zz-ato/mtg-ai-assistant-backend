// app/my-decks/[id]/page.tsx
import Client from "./Client";

export default async function DeckEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 15: params is a Promise
  return <Client deckId={id} />;
}
