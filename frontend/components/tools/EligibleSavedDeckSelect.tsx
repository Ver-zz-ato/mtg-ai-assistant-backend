"use client";

import type { SavedDeckPickerRow } from "@/lib/deck/tool-deck-eligibility";
import { getAiDeckHalfwayMinimumCards } from "@/lib/deck/tool-deck-eligibility";

type Props = {
  decks: SavedDeckPickerRow[];
  hiddenCount: number;
  loading?: boolean;
  value: string;
  onChange: (deckId: string, deck: SavedDeckPickerRow | null) => void;
  className?: string;
  label?: string;
  emptyLabel?: string;
  placeholder?: string;
};

export default function EligibleSavedDeckSelect({
  decks,
  hiddenCount,
  loading = false,
  value,
  onChange,
  className = "",
  label = "Your saved decks",
  emptyLabel = "No saved decks meet the minimum size yet.",
  placeholder = "Paste a list below or pick a deck",
}: Props) {
  const minHint =
    hiddenCount > 0
      ? `Decks under halfway (${getAiDeckHalfwayMinimumCards("Commander")}+ Commander / ${getAiDeckHalfwayMinimumCards("Standard")}+ other formats) are hidden.`
      : null;

  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-400">{label}</span>
      <select
        value={value}
        disabled={loading}
        onChange={(e) => {
          const id = e.target.value;
          const deck = decks.find((d) => d.id === id) ?? null;
          onChange(id, deck);
        }}
        className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        <option value="">{loading ? "Loading your decks…" : placeholder}</option>
        {decks.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title} ({d.cardCount} cards · {d.format})
          </option>
        ))}
      </select>
      {!loading && decks.length === 0 ? (
        <p className="mt-1.5 text-xs text-neutral-500">{emptyLabel}</p>
      ) : null}
      {minHint ? <p className="mt-1.5 text-xs text-neutral-500">{minHint}</p> : null}
    </label>
  );
}
