// components/DeckPublicToggle.tsx
"use client";
import { useState } from "react";
import { trackDeckShared } from "@/lib/analytics-enhanced";
import { validatePublicText } from "@/lib/profanity";

type Props = {
  deckId: string;
  initialIsPublic?: boolean;
  compact?: boolean;
  /** Deck title for profanity check when publishing */
  deckTitle?: string | null;
};

export default function DeckPublicToggle({ deckId, initialIsPublic, compact, deckTitle }: Props) {
  const [isPublic, setIsPublic] = useState<boolean | undefined>(initialIsPublic);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setVisibility(nextVal: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (nextVal === true) {
        const titleCheck = validatePublicText(String(deckTitle ?? ""), "Deck name");
        if (!titleCheck.ok) {
          setError(titleCheck.message);
          setBusy(false);
          return;
        }
      }

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

      if (nextVal && !initialIsPublic) {
        trackDeckShared(deckId, "link", "public");
      }

      try {
        window.dispatchEvent(new CustomEvent("deck:visibility", { detail: { isPublic: nextVal } }));
      } catch {}
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2" : "mt-3 flex flex-col gap-2"}>
      <div className="flex items-center gap-2 flex-wrap">
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
      </div>
      {isPublic === true && (
        <p className="text-[11px] text-amber-200/80 max-w-xs">
          Public decks can be viewed by others and may appear on your public profile.
        </p>
      )}
      {error && <span className="text-xs text-red-400"> {error}</span>}
    </div>
  );
}
