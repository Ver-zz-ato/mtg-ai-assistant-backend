"use client";

import React, { useState } from "react";

interface Suggestion {
  card: string;
  role?: string;
  reason?: string;
}

interface FinishDeckPanelProps {
  deckId: string;
  cardCount: number;
  onClose: () => void;
  onCardsAdded?: () => void;
}

export default function FinishDeckPanel({
  deckId,
  cardCount,
  onClose,
  onCardsAdded,
}: FinishDeckPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    lands?: number;
    ramp?: number;
    draw?: number;
    removal?: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [adding, setAdding] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/deck/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckId, format: "Commander", useScryfall: true }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || "Analysis failed");
        }
        setCounts(json?.counts ?? null);
        setSuggestions(Array.isArray(json?.suggestions) ? json.suggestions : []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [deckId]);

  const handleAdd = async (card: string) => {
    setAdding((prev) => new Set(prev).add(card));
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: card, qty: 1 }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Add failed");
      }
      setSuggestions((prev) => prev.filter((s) => s.card !== card));
      try {
        window.dispatchEvent(new Event("deck:changed"));
      } catch {}
      onCardsAdded?.();
    } catch {
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(card);
        return next;
      });
    }
  };

  const targetTotal = 100;
  const needed = Math.max(0, targetTotal - cardCount);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Finish This Deck</h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading && (
            <div className="text-neutral-400 text-sm">Analyzing deck…</div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm mb-4">
              {error}
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="mb-6 p-4 rounded-xl bg-neutral-900/80 border border-neutral-800">
                <p className="text-neutral-300 mb-2">
                  You have <strong className="text-white">{cardCount}</strong> cards.{" "}
                  {needed > 0 ? (
                    <>Need <strong className="text-amber-400">{needed}</strong> more for a 100-card Commander deck.</>
                  ) : (
                    <>Deck is complete (100 cards).</>
                  )}
                </p>
                {counts && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span>Lands: {counts.lands ?? "—"}</span>
                    <span>Ramp: {counts.ramp ?? "—"}</span>
                    <span>Draw: {counts.draw ?? "—"}</span>
                    <span>Removal: {counts.removal ?? "—"}</span>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-semibold text-neutral-300 mb-3">
                Recommended Cards to Add
              </h3>
              {suggestions.length === 0 ? (
                <p className="text-neutral-500 text-sm">No suggestions right now. Try running analysis from the Build Assistant.</p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {suggestions.slice(0, 12).map((s, i) => (
                    <li
                      key={s.card}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800"
                    >
                      <div>
                        <span className="font-medium text-white">{s.card}</span>
                        {s.role && (
                          <span className="ml-2 text-xs text-neutral-500">{s.role}</span>
                        )}
                        {s.reason && (
                          <p className="text-xs text-neutral-400 mt-0.5">{s.reason}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAdd(s.card)}
                        disabled={adding.has(s.card)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium"
                      >
                        {adding.has(s.card) ? "Adding…" : "Add"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
