"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getImagesForNames, type ImageInfo } from "@/lib/scryfall-cache";
import {
  deckFormatStringToAnalyzeFormat,
  getFinishDeckModalCounts,
} from "@/lib/deck/formatRules";

interface Suggestion {
  card: string;
  role?: string;
  reason?: string;
}

interface FinishDeckPanelProps {
  deckId: string;
  cardCount: number;
  /** Deck format from parent (e.g. deck row). Defaults to Commander for legacy callers. */
  format?: string | null;
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
  format,
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
  const [suggestMoreLoading, setSuggestMoreLoading] = useState(false);
  const [suggestMoreMessage, setSuggestMoreMessage] = useState<string | null>(null);
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
          body: JSON.stringify({
            deckId,
            format: deckFormatStringToAnalyzeFormat(format),
            useScryfall: true,
          }),
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
  }, [deckId, format]);

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

  function mergeSuggestionLists(
    existing: Suggestion[],
    incoming: Array<{ card: string; role?: string; reason?: string }>
  ): Suggestion[] {
    const seen = new Set(existing.map((s) => norm(s.card)));
    const out = [...existing];
    for (const s of incoming) {
      const k = norm(s.card);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push({ card: s.card, role: s.role, reason: s.reason });
    }
    return out;
  }

  async function suggestMore() {
    setSuggestMoreMessage(null);
    setSuggestMoreLoading(true);
    try {
      const res = await fetch("/api/deck/finish-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId,
          format: deckFormatStringToAnalyzeFormat(format),
          maxSuggestions: 14,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const msg =
          typeof json?.error === "string"
            ? json.error
            : res.status === 429
              ? "Daily suggestion limit reached. Try again tomorrow or upgrade."
              : "Could not fetch more suggestions.";
        setSuggestMoreMessage(msg);
        return;
      }
      const rows = Array.isArray(json.suggestions)
        ? json.suggestions.map((r: { card?: string; role?: string; reason?: string }) => ({
            card: String(r.card || "").trim(),
            role: typeof r.role === "string" ? r.role : undefined,
            reason: typeof r.reason === "string" ? r.reason : undefined,
          }))
        : [];
      const usable = rows.filter((r: { card: string }) => r.card);
      if (usable.length === 0) {
        setSuggestMoreMessage("No new cards returned — try again in a moment.");
        return;
      }
      setSuggestions((prev) => mergeSuggestionLists(prev, usable));
      if (Array.isArray(json.warnings) && json.warnings.length) {
        setSuggestMoreMessage(json.warnings[0]);
      }
    } catch {
      setSuggestMoreMessage("Network error while fetching suggestions.");
    } finally {
      setSuggestMoreLoading(false);
    }
  }

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

  const { needed, targetTotal, analyzeLabel } = getFinishDeckModalCounts(
    format,
    cardCount
  );

  const overlay = (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto">
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
                  You have <strong className="text-white">{cardCount}</strong>{" "}
                  {cardCount === 1 ? "card" : "cards"}.
                  {needed > 0 ? (
                    <>
                      {" "}
                      Need{" "}
                      <strong className="text-amber-400">{needed}</strong> more for a{" "}
                      {targetTotal}-card {analyzeLabel} deck.
                    </>
                  ) : (
                    <> Deck is complete ({targetTotal} cards).</>
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

              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold text-neutral-300">
                  Recommended Cards to Add
                </h3>
                <button
                  type="button"
                  onClick={() => void suggestMore()}
                  disabled={loading || suggestMoreLoading}
                  className="shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-semibold shadow-md"
                >
                  {suggestMoreLoading ? "Fetching…" : "Suggest more"}
                </button>
              </div>
              {suggestMoreMessage && (
                <p className="text-xs text-amber-300/90 mb-2">{suggestMoreMessage}</p>
              )}
              {suggestions.length === 0 ? (
                <p className="text-neutral-500 text-sm">No suggestions right now. Try running analysis from the Build Assistant.</p>
              ) : (
                <ul className="space-y-2 max-h-[min(68vh,620px)] overflow-y-auto pr-1">
                  {suggestions.map((s, idx) => {
                    const img = cardImages.get(norm(s.card));
                    return (
                      <li
                        key={`${norm(s.card)}-${idx}`}
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
                              <p className="text-xs text-neutral-400 mt-0.5 line-clamp-4">{s.reason}</p>
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

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(overlay, document.body);
}
