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
  initialDeckAim?: string | null;
};

export default function DeckPublicToggle({
  deckId,
  initialIsPublic,
  compact,
  deckTitle,
  initialDeckAim,
}: Props) {
  const [isPublic, setIsPublic] = useState<boolean | undefined>(initialIsPublic);
  const [deckAim, setDeckAim] = useState(initialDeckAim ?? "");
  const [aimDraft, setAimDraft] = useState(initialDeckAim ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);

  async function setVisibility(nextVal: boolean, nextDeckAim?: string) {
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
        body: JSON.stringify({
          id: deckId,
          is_public: nextVal,
          ...(nextVal ? { deck_aim: nextDeckAim ?? deckAim } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error || "Request failed");
      }
      setIsPublic(nextVal);
      if (nextVal && typeof nextDeckAim === "string") {
        setDeckAim(nextDeckAim);
      }

      if (nextVal && !initialIsPublic) {
        trackDeckShared(deckId, "link", "public");
      }

      try {
        window.dispatchEvent(new CustomEvent("deck:visibility", { detail: { isPublic: nextVal } }));
      } catch {}
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishSubmit() {
    const nextAim = aimDraft.trim().slice(0, 500);
    if (!nextAim) {
      setError("Add a deck aim / strategy before making this public.");
      return;
    }
    const aimCheck = validatePublicText(nextAim, "Deck aim");
    if (!aimCheck.ok) {
      setError(aimCheck.message);
      return;
    }
    try {
      await setVisibility(true, nextAim);
      setShowPublishModal(false);
    } catch {}
  }

  return (
    <>
      <div className={compact ? "flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2" : "mt-3 flex flex-col gap-2"}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm">Visibility:</span>
          <button
            disabled={busy || isPublic === true}
            onClick={() => {
              setError(null);
              setAimDraft(deckAim);
              setShowPublishModal(true);
            }}
            className={`px-3 py-1 rounded border transition-colors ${isPublic ? "bg-green-600 border-green-500 text-white" : "bg-neutral-900 border-neutral-700 hover:bg-neutral-800"}`}
            aria-pressed={isPublic ? "true" : "false"}
            title="Make this deck visible to others"
          >
            Public
          </button>
          <button
            disabled={busy || isPublic === false}
            onClick={() => {
              void setVisibility(false).catch(() => {});
            }}
            className={`px-3 py-1 rounded border transition-colors ${isPublic === false ? "bg-red-600 border-red-500 text-white" : "bg-neutral-900 border-neutral-700 hover:bg-neutral-800"}`}
            aria-pressed={isPublic === false ? "true" : "false"}
            title="Hide this deck from others"
          >
            Private
          </button>
          {busy && <span className="text-xs opacity-70">Saving...</span>}
        </div>
        {isPublic === true && (
          <p className="text-[11px] text-amber-200/80 max-w-xs">
            Public decks can be viewed by others and may appear on your public profile.
          </p>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {showPublishModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-950 p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Describe the deck before publishing</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Add the deck&apos;s aim and strategy. This shows on the public deck page and is required before the deck can go public.
            </p>
            <textarea
              value={aimDraft}
              onChange={(e) => setAimDraft(e.target.value.slice(0, 500))}
              placeholder="Token swarm with aristocrats payoffs..."
              className="mt-3 h-28 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-blue-500"
            />
            <div className="mt-1 text-right text-[11px] text-neutral-500">{aimDraft.trim().length}/500</div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPublishModal(false);
                  setError(null);
                }}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePublishSubmit()}
                className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
              >
                Make Public
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
