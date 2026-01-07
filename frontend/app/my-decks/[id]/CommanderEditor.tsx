// app/my-decks/[id]/CommanderEditor.tsx
"use client";
import * as React from "react";

export default function CommanderEditor({ deckId, initial, format, readOnly }: { deckId: string; initial: string | null; format?: string; readOnly?: boolean }) {
  // Only show for Commander format
  if (format?.toLowerCase() !== 'commander') {
    return null;
  }
  
  // Read-only mode: just display
  if (readOnly) {
    return (
      <div>
        <div className="text-xs opacity-70 mb-1">Commander:</div>
        <div className="text-lg font-semibold text-blue-400">{initial || "Not set"}</div>
      </div>
    );
  }

  const [commander, setCommander] = React.useState(initial || "");
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Update when initial changes (e.g., from server)
  React.useEffect(() => {
    setCommander(initial || "");
  }, [initial]);

  async function save(nextCommander: string) {
    const c = nextCommander.trim();
    if (c === commander) return setEditing(false);
    setBusy(true); 
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/commander`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commander: c }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setCommander(c);
      setEditing(false);
      // Dispatch event to refresh deck data
      window.dispatchEvent(new Event('deck:changed'));
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setEditing(false);
      setCommander(initial || "");
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col">
        <input
          autoFocus
          defaultValue={commander}
          onBlur={(e) => save(e.currentTarget.value)}
          onKeyDown={onKey}
          disabled={busy}
          placeholder="Commander name"
          className="text-lg font-semibold bg-transparent border-b border-neutral-700 outline-none focus:border-blue-500 px-2 py-1"
        />
        {error && <span className="text-xs text-red-400 mt-1">{error}</span>}
      </div>
    );
  }

  return (
    <div className="group relative inline-block">
      <button
        type="button"
        title="Edit commander"
        onClick={() => setEditing(true)}
        className="text-lg font-semibold text-left hover:opacity-90 transition-opacity text-blue-400">
        {commander || "No commander set"}
      </button>
      <div className="absolute -bottom-5 left-0 text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span>Click to edit</span>
      </div>
    </div>
  );
}
