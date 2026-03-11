"use client";

import React, { useState, useEffect, useRef } from "react";
import { getImagesForNames, type ImageInfo } from "@/lib/scryfall-cache";

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

const STAGES = [
  { key: "loading", label: "Loading deck...", icon: "📋" },
  { key: "analyzing", label: "Analyzing deck structure...", icon: "🔍" },
  { key: "checking", label: "Checking card legality...", icon: "✓" },
  { key: "generating", label: "Generating AI suggestions...", icon: "✨" },
  { key: "finalizing", label: "Finalizing recommendations...", icon: "🎯" },
];

function norm(name: string) {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export default function FinishDeckPanel({
  deckId,
  cardCount,
  onClose,
  onCardsAdded,
}: FinishDeckPanelProps) {
  const [loading, setLoading] = useState(true);
  const [progressStage, setProgressStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{
    lands?: number;
    ramp?: number;
    draw?: number;
    removal?: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [cardImages, setCardImages] = useState<Map<string, ImageInfo>>(new Map());
  const [hoverCard, setHoverCard] = useState<{ name: string; x: number; y: number; src: string } | null>(null);
  const stageInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading) return;
    stageInterval.current = setInterval(() => {
      setProgressStage((prev) => Math.min(prev + 1, STAGES.length - 1));
    }, 600);
    return () => {
      if (stageInterval.current) clearInterval(stageInterval.current);
    };
  }, [loading]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      setProgressStage(0);
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
        setProgressStage(STAGES.length - 1);
      }
    })();
  }, [deckId]);

  useEffect(() => {
    if (suggestions.length === 0) return;
    (async () => {
      try {
        const names = suggestions.map((s) => s.card);
        const map = await getImagesForNames(names);
        setCardImages(map);
      } catch {}
    })();
  }, [suggestions.map((s) => s.card).join("|")]);

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
            <div className="py-8">
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500 border-t-transparent" />
                <p className="text-neutral-300 font-medium">{STAGES[progressStage]?.label ?? "Analyzing deck…"}</p>
              </div>
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-full transition-all duration-300"
                  style={{ width: `${((progressStage + 1) / STAGES.length) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-500">
                {STAGES.map((s, i) => (
                  <span key={s.key} className={progressStage >= i ? "text-purple-400" : ""}>
                    {s.icon}
                  </span>
                ))}
              </div>
            </div>
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
                <ul className="space-y-2 max-h-[320px] overflow-y-auto">
                  {suggestions.slice(0, 12).map((s) => {
                    const img = cardImages.get(norm(s.card));
                    return (
                      <li
                        key={s.card}
                        className="flex items-start justify-between gap-3 p-3 rounded-lg bg-neutral-900 border border-neutral-800"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {img?.small && (
                            <img
                              src={img.small}
                              alt={s.card}
                              className="w-11 h-[68px] object-cover rounded border border-neutral-600 flex-shrink-0 cursor-pointer hover:border-purple-500 transition-colors"
                              onMouseEnter={(e) => {
                                if (img?.normal) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoverCard({ name: s.card, x: rect.right + 12, y: rect.top, src: img.normal });
                                }
                              }}
                              onMouseMove={(e) => {
                                if (hoverCard?.name === s.card && img?.normal) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoverCard({ name: s.card, x: rect.right + 12, y: rect.top, src: img.normal });
                                }
                              }}
                              onMouseLeave={() => setHoverCard(null)}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-white">{s.card}</span>
                            {s.role && (
                              <span className="ml-2 text-xs text-neutral-500">{s.role}</span>
                            )}
                            {s.reason && (
                              <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{s.reason}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleAdd(s.card)}
                          disabled={adding.has(s.card)}
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium"
                        >
                          {adding.has(s.card) ? "Adding…" : "+ Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {/* Card hover preview */}
      {hoverCard && (
        <div
          className="fixed pointer-events-none z-[10000]"
          style={{ left: hoverCard.x, top: hoverCard.y }}
        >
          <img
            src={hoverCard.src}
            alt={hoverCard.name}
            className="w-64 rounded-lg shadow-2xl border-2 border-neutral-700"
          />
        </div>
      )}
    </div>
  );
}
