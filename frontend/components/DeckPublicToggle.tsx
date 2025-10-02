// components/DeckPublicToggle.tsx
"use client";
import { useState } from "react";

type Props = {
  deckId: string;
  initialIsPublic?: boolean;
  compact?: boolean;
};

export default function DeckPublicToggle({ deckId, initialIsPublic, compact }: Props) {
  const [isPublic, setIsPublic] = useState<boolean | undefined>(initialIsPublic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setVisibility(nextVal: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: deckId, is_public: nextVal }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error || "Request failed");
      }
      setIsPublic(nextVal);
      try { window.dispatchEvent(new CustomEvent('deck:visibility', { detail: { isPublic: nextVal } })); } catch {}
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex items-center gap-2" : "mt-3 flex items-center gap-3"}>
      <span className="text-sm">Visibility:</span>
      <button
        disabled={busy || isPublic === true}
        onClick={() => setVisibility(true)}
        className={`px-3 py-1 rounded border transition-colors ${isPublic ? "bg-green-600 border-green-500 text-white" : "bg-neutral-900 border-neutral-700 hover:bg-neutral-800"}`}
        aria-pressed={isPublic ? "true" : "false"}
        title="Make this deck visible to others"
      >
        Public
      </button>
      <button
        disabled={busy || isPublic === false}
        onClick={() => setVisibility(false)}
        className={`px-3 py-1 rounded border transition-colors ${isPublic === false ? "bg-red-600 border-red-500 text-white" : "bg-neutral-900 border-neutral-700 hover:bg-neutral-800"}`}
        aria-pressed={isPublic === false ? "true" : "false"}
        title="Hide this deck from others"
      >
        Private
      </button>
      {busy && <span className="text-xs opacity-70">Saving…</span>}
      {error && <span className="text-xs text-red-500"> {error}</span>}
    </div>
  );
}
