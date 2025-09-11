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
      const res = await fetch(`/api/decks/${deckId}/publish`, {
        method: nextVal ? "POST" : "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Request failed");
      }
      setIsPublic(json.is_public === true);
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
        className={`px-3 py-1 rounded border ${isPublic ? "bg-green-600 text-white" : "bg-transparent"}`}
        aria-pressed={isPublic ? "true" : "false"}
      >
        Public
      </button>
      <button
        disabled={busy || isPublic === false}
        onClick={() => setVisibility(false)}
        className={`px-3 py-1 rounded border ${isPublic === false ? "bg-gray-600 text-white" : "bg-transparent"}`}
        aria-pressed={isPublic === false ? "true" : "false"}
      >
        Private
      </button>
      {busy && <span className="text-xs opacity-70">Saving…</span>}
      {typeof isPublic === "boolean" && (
        <span className="text-xs opacity-70">
          {isPublic ? "This deck is public." : "This deck is private."}
        </span>
      )}
      {error && <span className="text-xs text-red-500"> {error}</span>}
    </div>
  );
}
