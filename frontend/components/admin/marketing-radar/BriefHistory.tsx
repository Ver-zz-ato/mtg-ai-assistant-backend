"use client";

import type { BriefHistoryItem } from "./types";

type Props = {
  items: BriefHistoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function BriefHistory({ items, selectedId, onSelect }: Props) {
  if (!items.length) {
    return <p className="text-sm text-neutral-500">No briefs yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => onSelect(b.id)}
            className={`w-full text-left rounded border px-3 py-2 text-sm transition-colors ${
              selectedId === b.id
                ? "border-emerald-700 bg-emerald-950/40"
                : "border-neutral-700 bg-neutral-950/50 hover:bg-neutral-900/60"
            }`}
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium">{b.brief_date}</span>
              <span className="text-xs text-neutral-500">{b.draft_count} drafts</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
              {b.summary_preview || "(no summary)"}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
