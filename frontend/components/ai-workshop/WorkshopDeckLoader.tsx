"use client";

import { WORKSHOP_FORMATS } from "@/lib/deck/ai-workshop-actions";
import { getAiDeckHalfwayMinimumCards } from "@/lib/deck/tool-deck-eligibility";

type DeckOption = { id: string; title: string; cardCount?: number; format?: string };

type Props = {
  deckText: string;
  format: string;
  commander: string;
  deckTitle: string;
  decks: DeckOption[];
  hiddenDeckCount?: number;
  selectedDeckId: string;
  bootLoading: boolean;
  onDeckText: (v: string) => void;
  onFormat: (v: string) => void;
  onCommander: (v: string) => void;
  onDeckTitle: (v: string) => void;
  onSelectDeckId: (id: string) => void;
  onFixNames?: () => void;
};

export function WorkshopDeckLoader({
  deckText,
  format,
  commander,
  deckTitle,
  decks,
  hiddenDeckCount = 0,
  selectedDeckId,
  bootLoading,
  onDeckText,
  onFormat,
  onCommander,
  onDeckTitle,
  onSelectDeckId,
  onFixNames,
}: Props) {
  return (
    <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-300">Load a deck</h3>
        {onFixNames && deckText.trim() ? (
          <button
            type="button"
            onClick={onFixNames}
            className="min-h-[40px] rounded-lg border border-neutral-600 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 touch-manipulation"
          >
            Fix card names
          </button>
        ) : null}
      </div>

      {decks.length > 0 ? (
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Your saved decks</span>
          <select
            value={selectedDeckId}
            disabled={bootLoading}
            onChange={(e) => onSelectDeckId(e.target.value)}
            className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            <option value="">Paste a list below or pick a deck</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
                {typeof d.cardCount === "number" ? ` (${d.cardCount} cards)` : ""}
              </option>
            ))}
          </select>
          {hiddenDeckCount > 0 ? (
            <p className="mt-1.5 text-xs text-neutral-500">
              {hiddenDeckCount} saved deck{hiddenDeckCount === 1 ? "" : "s"} hidden — need at least{" "}
              {getAiDeckHalfwayMinimumCards("Commander")} cards (Commander) or{" "}
              {getAiDeckHalfwayMinimumCards("Standard")} (other formats).
            </p>
          ) : null}
        </label>
      ) : (
        <p className="text-sm text-amber-200/90">
          Sign in to load decks from your ManaTap account, or paste any decklist below.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {WORKSHOP_FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFormat(f)}
            className={`min-h-[40px] rounded-full border px-3 py-1.5 text-sm font-semibold touch-manipulation ${
              format === f
                ? "border-violet-400/50 bg-violet-500/20 text-violet-100"
                : "border-neutral-700 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-neutral-400">Deck title</span>
          <input
            value={deckTitle}
            onChange={(e) => onDeckTitle(e.target.value)}
            className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            placeholder="My deck"
          />
        </label>
        {format === "Commander" ? (
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-neutral-400">Commander</span>
            <input
              value={commander}
              onChange={(e) => onCommander(e.target.value)}
              className="w-full min-h-[40px] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              placeholder="Commander name"
            />
          </label>
        ) : null}
      </div>

      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-medium text-neutral-400">Decklist</span>
        <textarea
          value={deckText}
          onChange={(e) => onDeckText(e.target.value)}
          rows={10}
          disabled={bootLoading}
          placeholder="1 Sol Ring&#10;1 Command Tower&#10;..."
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-sm text-white"
        />
      </label>
      {bootLoading ? <p className="text-sm text-neutral-400">Loading your saved deck…</p> : null}
    </div>
  );
}
