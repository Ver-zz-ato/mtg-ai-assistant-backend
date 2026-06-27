"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useHoverPreview } from "@/components/shared/HoverPreview";

export type DeckPreviewResult = {
  decklist: Array<{ name: string; qty: number }>;
  commander: string;
  colors: string[];
  overallAim: string;
  title: string;
  deckText: string;
  format: string;
  plan: string;
};

interface DeckGenerationResultsModalProps {
  preview: DeckPreviewResult;
  onClose: () => void;
  onCreateDeck?: (preview: DeckPreviewResult) => void | Promise<void>;
  isCreating?: boolean;
  requireAuth?: boolean;
  isGuest?: boolean;
}

function normalizeQty(qty: number): number {
  return Math.max(1, Math.floor(Number(qty) || 1));
}

function renderDeckText(decklist: DeckPreviewResult["decklist"]): string {
  return decklist.map((card) => `${normalizeQty(card.qty)} ${card.name}`).join("\n");
}

export default function DeckGenerationResultsModal({
  preview,
  onClose,
  onCreateDeck,
  isCreating = false,
  requireAuth = false,
  isGuest = false,
}: DeckGenerationResultsModalProps) {
  const router = useRouter();
  const { preview: hoverPreview, bind } = useHoverPreview();
  const [images, setImages] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [editedDecklist, setEditedDecklist] = useState(preview.decklist);
  const commanderImage = images[preview.commander]?.normal || images[preview.commander]?.small;
  const totalCards = editedDecklist.reduce((sum, card) => sum + normalizeQty(card.qty), 0);
  const editedPreview = useMemo<DeckPreviewResult>(
    () => ({
      ...preview,
      decklist: editedDecklist,
      deckText: renderDeckText(editedDecklist),
    }),
    [preview, editedDecklist],
  );

  useEffect(() => {
    setEditedDecklist(preview.decklist);
  }, [preview]);

  useEffect(() => {
    const names = [preview.commander, ...preview.decklist.map((c) => c.name)];
    const uniq = Array.from(new Set(names));
    if (uniq.length === 0) return;
    fetch("/api/cards/batch-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: uniq }),
    })
      .then((r) => r.json())
      .then((j) => {
        const map: Record<string, { small?: string; normal?: string }> = {};
        (j?.data || []).forEach((c: { name: string; image_uris?: { small?: string; normal?: string } }) => {
          if (c?.name && c?.image_uris) {
            map[c.name] = { small: c.image_uris.small, normal: c.image_uris.normal };
          }
        });
        setImages(map);
      })
      .catch(() => {});
  }, [preview.commander, preview.decklist]);

  const handleCreateDeck = async () => {
    if (editedDecklist.length === 0) return;
    if (requireAuth && isGuest) {
      router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
      onClose();
      return;
    }
    if (onCreateDeck) {
      await onCreateDeck(editedPreview);
      return;
    }
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editedPreview.title,
          format: editedPreview.format,
          plan: editedPreview.plan,
          colors: editedPreview.colors,
          deck_text: editedPreview.deckText,
          is_public: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to create deck");
      }
      onClose();
      router.push(`/my-decks/${json.id}`);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to create deck");
    }
  };

  const handleDiscard = () => {
    onClose();
  };

  const changeQty = (index: number, delta: number) => {
    if (isCreating) return;
    setEditedDecklist((cards) =>
      cards.flatMap((card, i) => {
        if (i !== index) return [card];
        const nextQty = normalizeQty(card.qty) + delta;
        return nextQty <= 0 ? [] : [{ ...card, qty: nextQty }];
      }),
    );
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && handleDiscard()}
    >
      <div
        className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex-shrink-0 border-b border-neutral-800">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold text-white">AI Deck Preview</h2>
            <button onClick={handleDiscard} className="text-neutral-400 hover:text-white" aria-label="Close">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Commander with art */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-20 h-28 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0">
              {commanderImage ? (
                <img
                  src={commanderImage}
                  alt={preview.commander}
                  className="w-full h-full object-cover"
                  {...(bind(commanderImage) as any)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">Loading</div>
              )}
            </div>
            <div>
              <p className="text-sm text-neutral-400">Commander</p>
              <p className="text-lg font-semibold text-white">{preview.commander}</p>
              {preview.colors?.length > 0 && (
                <p className="text-xs text-neutral-500 mt-1">Color identity: {preview.colors.join(", ")}</p>
              )}
            </div>
          </div>

          {/* Overall aim */}
          <div className="rounded-lg bg-neutral-900/80 border border-neutral-800 p-3">
            <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Deck aim</p>
            <p className="text-sm text-neutral-200">{preview.overallAim}</p>
          </div>
        </div>

        {/* Card list - scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <p className="text-xs text-neutral-400 uppercase tracking-wide mb-3">
            Cards ({totalCards} total{totalCards !== editedDecklist.length ? `, ${editedDecklist.length} unique` : ""})
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-2">
            {editedDecklist.length === 0 ? (
              <div className="rounded border border-neutral-800 bg-neutral-900/60 px-3 py-4 text-sm text-neutral-400">
                No cards selected.
              </div>
            ) : editedDecklist.map((c, index) => {
              const img = images[c.name];
              return (
                <div
                  key={`${c.name}-${index}`}
                  className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-neutral-900/80 group"
                >
                  <div className="w-8 h-11 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
                    {img?.small || img?.normal ? (
                      <img
                        src={img.small || img.normal}
                        alt={c.name}
                        className="w-full h-full object-cover"
                        {...(bind((img.normal || img.small) as string) as React.HTMLAttributes<HTMLImageElement>)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[8px] text-neutral-600">
                        ...
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => changeQty(index, -1)}
                      disabled={isCreating}
                      className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
                      aria-label={`Remove one ${c.name}`}
                      title={normalizeQty(c.qty) <= 1 ? "Remove row" : "Remove one"}
                    >
                      -
                    </button>
                    <span className="font-mono text-xs text-neutral-300 w-6 text-center">{normalizeQty(c.qty)}</span>
                    <button
                      type="button"
                      onClick={() => changeQty(index, 1)}
                      disabled={isCreating}
                      className="h-7 w-7 rounded border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-50"
                      aria-label={`Add one ${c.name}`}
                      title="Add one"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm text-neutral-200 truncate flex-1">{c.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 flex-shrink-0 border-t border-neutral-800 flex gap-3">
          {requireAuth && isGuest ? (
            <button
              onClick={() => {
                router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
                onClose();
              }}
              className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
            >
              Create account to save deck
            </button>
          ) : (
            <button
              onClick={handleCreateDeck}
              disabled={isCreating || editedDecklist.length === 0}
              className="flex-1 py-3 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 text-white font-semibold"
            >
              {isCreating ? "Creating..." : "Create Deck"}
            </button>
          )}
          <button
            onClick={handleDiscard}
            disabled={isCreating}
            className="px-6 py-3 rounded-lg border border-neutral-600 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      </div>
      {hoverPreview}
    </div>
  );
}
