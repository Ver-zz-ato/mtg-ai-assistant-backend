"use client";

import React from "react";
import Link from "next/link";
import type { DeckUsageItem } from "@/lib/collection/deckCardUsage";

export type CollectionCardDetailModalProps = {
  open: boolean;
  onClose: () => void;
  cardName: string;
  /** Prefer row id so <details> resets when opening a different row with the same name (edge case). */
  detailsResetKey?: string;
  collectionQty?: number;
  imageNormal?: string;
  imageSmall?: string;
  deckUsages: DeckUsageItem[];
};

export default function CollectionCardDetailModal({
  open,
  onClose,
  cardName,
  detailsResetKey,
  collectionQty,
  imageNormal,
  imageSmall,
  deckUsages,
}: CollectionCardDetailModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const img = imageNormal || imageSmall;
  const scryUrl = `https://scryfall.com/search?q=!%22${encodeURIComponent(cardName)}%22`;
  const detailsKey = detailsResetKey || cardName;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-neutral-100 truncate" title={cardName}>
              {cardName}
            </h3>
            {typeof collectionQty === "number" && (
              <p className="text-xs text-neutral-400 mt-0.5">In collection: ×{collectionQty}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-neutral-400 hover:text-white p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {img ? (
          <div className="mb-4 rounded-lg overflow-hidden border border-neutral-800">
            <img src={img} alt={cardName} className="w-full h-auto block bg-neutral-950" />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 text-sm mb-4">
          <a
            href={scryUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-600"
          >
            Scryfall ↗
          </a>
        </div>

        {deckUsages.length > 0 ? (
          <details key={detailsKey} className="rounded-lg border border-neutral-700 bg-neutral-950/80">
            <summary className="cursor-pointer select-none px-3 py-2.5 list-none text-sm font-semibold text-neutral-200">
              In your decks
            </summary>
            <ul className="divide-y divide-neutral-800 border-t border-neutral-800 max-h-48 overflow-y-auto">
              {deckUsages.map((u) => (
                <li key={u.deckId}>
                  <Link
                    href={`/my-decks/${u.deckId}`}
                    onClick={() => onClose()}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-neutral-900/80"
                  >
                    <span className="truncate text-neutral-200" title={u.deckTitle}>
                      {u.deckTitle}
                    </span>
                    <span className="shrink-0 tabular-nums text-neutral-400">×{u.qty}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
