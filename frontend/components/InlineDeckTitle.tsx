// components/InlineDeckTitle.tsx
"use client";
import * as React from "react";

export default function InlineDeckTitle({ deckId, initial }: { deckId: string; initial: string }) {
  const [title, setTitle] = React.useState(initial || "Untitled Deck");
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(nextTitle: string) {
    const t = nextTitle.trim() || "Untitled Deck";
    if (t === title) return setEditing(false);
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/decks/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deckId, title: t }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setTitle(t);
      setEditing(false);
    } catch (e:any) {
      setError(e?.message || "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col">
        <input
          autoFocus
          defaultValue={title}
          onBlur={(e) => save(e.currentTarget.value)}
          onKeyDown={onKey}
          disabled={busy}
          className="text-2xl font-semibold bg-transparent border-b border-neutral-700 outline-none focus:border-neutral-400"
        />
        {error && <span className="text-xs text-red-400 mt-1">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      title="Rename deck"
      onClick={() => setEditing(true)}
      className="text-2xl font-semibold text-left hover:opacity-90">
      {title}
    </button>
  );
}
