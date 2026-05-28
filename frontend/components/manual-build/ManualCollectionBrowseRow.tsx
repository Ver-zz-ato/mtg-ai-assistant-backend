"use client";

import CardRowPreviewLeft from "@/components/shared/CardRowPreview";
import type { CollectionCardMeta } from "@/lib/build/useCollectionBuildMetadata";

type Props = {
  name: string;
  meta?: CollectionCardMeta;
  priceUsd?: number;
  inDeck: number;
  collectionQty: number;
  capTotal: number;
  canAdd: boolean;
  onAdd: () => void;
};

export default function ManualCollectionBrowseRow({
  name,
  meta,
  priceUsd,
  inDeck,
  collectionQty,
  capTotal,
  canAdd,
  onAdd,
}: Props) {
  const owned = collectionQty > 0 ? collectionQty : capTotal;

  return (
    <li className="flex items-center gap-2 p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60">
      <div className="flex-1 min-w-0">
        <CardRowPreviewLeft
          name={name}
          imageSmall={meta?.imageSmall}
          imageLarge={meta?.imageNormal}
          setCode={meta?.set}
          rarity={meta?.rarity}
        />
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {priceUsd != null ? (
          <span className="text-xs text-neutral-400">${priceUsd.toFixed(2)}</span>
        ) : null}
        <span className="text-xs text-neutral-500 tabular-nums">
          {inDeck}/{owned}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          <div
            className={`relative w-9 h-9 rounded-lg border flex items-center justify-center ${
              inDeck > 0
                ? "border-purple-500/50 bg-purple-950/30"
                : "border-neutral-700 bg-neutral-950"
            }`}
            title="In deck"
          >
            <svg
              className={`w-5 h-5 ${inDeck > 0 ? "text-purple-300" : "text-neutral-600"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <rect x="3" y="4" width="14" height="18" rx="1.5" />
              <rect x="7" y="2" width="14" height="18" rx="1.5" className="opacity-70" />
            </svg>
            {inDeck > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-purple-600 text-[10px] font-bold text-white flex items-center justify-center">
                {inDeck > 9 ? "9+" : inDeck}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!canAdd}
            onClick={onAdd}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold"
          >
            Add
          </button>
        </div>
      </div>
    </li>
  );
}
