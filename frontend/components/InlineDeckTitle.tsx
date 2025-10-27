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
    <div className="group relative inline-block">
      <button
        type="button"
        title="Rename deck"
        onClick={() => setEditing(true)}
        className="text-2xl font-semibold text-left hover:opacity-90 transition-opacity">
        {title}
      </button>
      <div className="absolute -bottom-5 left-0 text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span>Click to rename</span>
      </div>
    </div>
  );
}
