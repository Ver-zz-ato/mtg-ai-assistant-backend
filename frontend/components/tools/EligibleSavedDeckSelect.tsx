"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  hiddenHint?: string;
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
  hiddenHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedDeck = useMemo(() => decks.find((deck) => deck.id === value) ?? null, [decks, value]);
  const minHint =
    hiddenCount > 0
      ? hiddenHint ||
        `Decks under halfway (${getAiDeckHalfwayMinimumCards("Commander")}+ Commander / ${getAiDeckHalfwayMinimumCards("Standard")}+ other formats) are hidden.`
      : null;
  const buttonLabel = loading
    ? "Loading your decks..."
    : selectedDeck
      ? `${selectedDeck.title} (${selectedDeck.cardCount} cards - ${selectedDeck.format})`
      : placeholder;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function chooseDeck(deckId: string) {
    const deck = decks.find((d) => d.id === deckId) ?? null;
    onChange(deckId, deck);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-400">{label}</span>
      <button
        type="button"
        disabled={loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!loading) setOpen((current) => !current);
        }}
        className="flex min-h-[42px] w-full items-center justify-between gap-3 rounded-md border border-cyan-300/20 bg-black/55 px-3 py-2 text-left text-sm font-semibold text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition hover:border-cyan-300/45 hover:bg-cyan-300/5 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={selectedDeck ? "truncate text-zinc-100" : "truncate text-zinc-300"}>{buttonLabel}</span>
        <span className={`text-cyan-200 transition ${open ? "rotate-180" : ""}`} aria-hidden="true">
          v
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-y-auto rounded-md border border-cyan-300/25 bg-zinc-950/95 p-1.5 text-sm text-zinc-100 shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop-blur"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => chooseDeck("")}
            className={`flex w-full items-center rounded px-3 py-2 text-left transition ${
              !value
                ? "bg-cyan-300 text-zinc-950"
                : "text-zinc-300 hover:bg-cyan-300/10 hover:text-cyan-100"
            }`}
          >
            {placeholder}
          </button>
          {decks.map((deck) => {
            const selected = deck.id === value;
            return (
              <button
                key={deck.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => chooseDeck(deck.id)}
                className={`mt-1 flex w-full items-start justify-between gap-3 rounded px-3 py-2 text-left transition ${
                  selected
                    ? "bg-gradient-to-r from-cyan-300 to-amber-200 text-zinc-950"
                    : "text-zinc-100 hover:bg-white/10 hover:text-cyan-100"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">{deck.title}</span>
                  <span className={selected ? "mt-0.5 block text-xs text-zinc-800" : "mt-0.5 block text-xs text-zinc-500"}>
                    {deck.cardCount} cards - {deck.format}
                  </span>
                </span>
                {deck.commander ? (
                  <span className={selected ? "shrink-0 text-xs font-bold text-zinc-800" : "shrink-0 text-xs font-bold text-amber-200/80"}>
                    Commander
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {!loading && decks.length === 0 ? (
        <p className="mt-1.5 text-xs text-neutral-500">{emptyLabel}</p>
      ) : null}
      {minHint ? <p className="mt-1.5 text-xs text-neutral-500">{minHint}</p> : null}
    </div>
  );
}
