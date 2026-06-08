"use client";

import { useState } from "react";

type Props = {
  deckTitle: string;
  sourceLabel: string;
  format: string;
  cardCount: number;
  commander: string;
  commanderArt?: string | null;
  colorIdentityLabel: string | null;
  deckText: string;
};

export function WorkshopDeckStrip({
  deckTitle,
  sourceLabel,
  format,
  cardCount,
  commander,
  commanderArt,
  colorIdentityLabel,
  deckText,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const chips = [format, `${cardCount} cards`, sourceLabel, colorIdentityLabel].filter(Boolean);

  return (
    <div className="relative overflow-hidden rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-950/40 via-neutral-900/80 to-neutral-950 p-4">
      {commanderArt ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-20 bg-cover bg-center"
          style={{ backgroundImage: `url(${commanderArt})` }}
          aria-hidden="true"
        />
      ) : null}
      <div className="relative">
        <div className="flex flex-wrap items-start gap-3">
          {commanderArt ? (
            <img
              src={commanderArt}
              alt=""
              className="h-14 w-10 shrink-0 rounded-md border border-neutral-700 object-cover"
            />
          ) : (
            <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-lg">
              🃏
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-violet-300/80">{sourceLabel}</p>
            <h2 className="truncate text-lg font-bold text-white">{deckTitle}</h2>
            <p className="text-sm text-neutral-400">
              {[commander || null, `${cardCount} cards`, format].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-200">
            Loaded
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={String(chip)}
              className="rounded-full border border-neutral-700 bg-black/30 px-2 py-0.5 text-xs text-neutral-300"
            >
              {chip}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 min-h-[40px] w-full rounded-lg border border-neutral-700 bg-black/30 px-3 py-2 text-left text-sm font-semibold text-neutral-200 hover:bg-black/50 touch-manipulation"
        >
          {expanded ? "Hide deck contents" : "Show deck contents"} ({cardCount} cards)
        </button>
        {expanded ? (
          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-neutral-800 bg-black/40 p-3 text-xs text-neutral-300 whitespace-pre-wrap">
            {deckText}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
