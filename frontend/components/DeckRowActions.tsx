'use client';

import { useRouter } from 'next/navigation';

export default function DeckRowActions(props: {
  id: string;
  title: string | null;
  is_public: boolean | null;
}) {
  const router = useRouter();
  const { id, title, is_public } = props;

  async function togglePublic() {
    await fetch('/api/decks/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_public: !is_public }),
    });
    router.refresh();
  }

  async function renameDeck() {
    const name = prompt('New deck title:', title || 'Untitled Deck');
    if (name == null) return;
    await fetch('/api/decks/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: name }),
    });
    router.refresh();
  }

  async function deleteDeck() {
    if (!confirm('Delete this deck? This cannot be undone.')) return;
    await fetch('/api/decks/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={togglePublic}
        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
        title="Toggle public/private"
      >
        {is_public ? 'Make Private' : 'Make Public'}
      </button>

      <button
        onClick={renameDeck}
        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
      >
        Rename
      </button>

      <button
        onClick={deleteDeck}
        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 text-red-600"
      >
        Delete
      </button>
    </div>
  );
}
