"use client";

import React, { useState, useCallback } from "react";
import {
  parseDecklist,
  getTotalCards,
  getUniqueCount,
  type ParsedCard,
} from "@/lib/mulligan/parse-decklist";
import { capture, hasConsent } from "@/lib/ph";

function shuffleDeck<T>(deck: T[]): T[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function expandDeck(cards: ParsedCard[]): string[] {
  const out: string[] = [];
  for (const { name, count } of cards) {
    for (let i = 0; i < count; i++) out.push(name);
  }
  return out;
}

function drawHand(deck: string[], size: number): string[] {
  const shuffled = shuffleDeck(deck);
  return shuffled.slice(0, size);
}

export default function MulliganAiPlayground() {
  const [deckSource, setDeckSource] = useState<"paste" | "load">("paste");
  const [deckText, setDeckText] = useState("");
  const [deckId, setDeckId] = useState("");
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [commander, setCommander] = useState<string | null>(null);

  const [playDraw, setPlayDraw] = useState<"play" | "draw">("play");
  const [mulliganCount, setMulliganCount] = useState(0);
  const [modelTier, setModelTier] = useState<"mini" | "full">("mini");

  const [currentHand, setCurrentHand] = useState<string[]>([]);
  const [handSize, setHandSize] = useState(7);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    action: "KEEP" | "MULLIGAN";
    confidence?: number;
    reasons: string[];
    suggestedLine?: string;
    warnings?: string[];
    model?: string;
  } | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleParse = useCallback(() => {
    const cards = parseDecklist(deckText);
    setParsedCards(cards);
    setError(null);
  }, [deckText]);

  const handleLoadDeck = useCallback(async () => {
    if (!deckId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId.trim())}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.cards)) {
        throw new Error(data.error || "Failed to load deck");
      }
      const cards: ParsedCard[] = (data.cards as { name: string; qty: number }[]).map(
        (c: { name: string; qty: number }) => ({ name: c.name, count: c.qty || 1 })
      );
      setParsedCards(cards);
      setDeckText(cards.map((c) => `${c.count} ${c.name}`).join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  const handleDraw7 = useCallback(() => {
    const expanded = expandDeck(parsedCards);
    if (expanded.length < 7) {
      setError("Deck needs at least 7 cards");
      return;
    }
    setCurrentHand(drawHand(expanded, 7));
    setHandSize(7);
    setMulliganCount(0);
    setResult(null);
    setError(null);
  }, [parsedCards]);

  const handleMulliganTo = useCallback(
    (size: number) => {
      if (parsedCards.length === 0) return;
      const expanded = expandDeck(parsedCards);
      if (expanded.length < size) return;
      setCurrentHand(drawHand(expanded, size));
      setHandSize(size);
      setMulliganCount(7 - size);
      setResult(null);
      setError(null);
    },
    [parsedCards]
  );

  const handleGetAdvice = useCallback(async () => {
    if (currentHand.length === 0 || parsedCards.length === 0) {
      setError("Draw a hand first and ensure deck is loaded");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setRawJson(null);

    if (hasConsent()) {
      capture("admin_mulligan_ai_advice_requested", {
        modelTier,
        mulliganCount,
        handSize: currentHand.length,
      });
    }

    try {
      const res = await fetch("/api/admin/mulligan/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelTier,
          format: "commander",
          playDraw,
          mulliganCount,
          hand: currentHand,
          deck: {
            cards: parsedCards,
            commander: commander || null,
          },
        }),
      });

      const data = await res.json();

      if (hasConsent()) {
        capture("admin_mulligan_ai_advice_result", {
          action: data.action,
          modelTier,
        });
      }

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResult({
        action: data.action,
        confidence: data.confidence,
        reasons: data.reasons || [],
        suggestedLine: data.suggestedLine,
        warnings: data.warnings,
        model: data.model,
      });
      setRawJson(JSON.stringify(data, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [currentHand, parsedCards, modelTier, playDraw, mulliganCount, commander]);

  const totalCards = getTotalCards(parsedCards);
  const uniqueCards = getUniqueCount(parsedCards);

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold text-amber-200">Mulligan AI Advice Playground</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Test harness for AI mulligan advice. Admin only.
        </p>
      </header>

      {/* Deck Input */}
      <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <h2 className="font-semibold text-neutral-200 mb-3">Deck Input</h2>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setDeckSource("paste")}
            className={`px-3 py-1.5 rounded text-sm ${deckSource === "paste" ? "bg-amber-600 text-black" : "bg-neutral-700 text-neutral-300"}`}
          >
            Paste decklist
          </button>
          <button
            onClick={() => setDeckSource("load")}
            className={`px-3 py-1.5 rounded text-sm ${deckSource === "load" ? "bg-amber-600 text-black" : "bg-neutral-700 text-neutral-300"}`}
          >
            Load my deck
          </button>
        </div>

        {deckSource === "paste" ? (
          <div className="space-y-2">
            <textarea
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;36 Forest&#10;..."
              className="w-full h-32 bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm font-mono resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleParse}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm"
              >
                Parse
              </button>
              {parsedCards.length > 0 && (
                <span className="text-xs text-neutral-400">
                  {totalCards} cards, {uniqueCards} unique
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              placeholder="Deck ID (e.g. from /my-decks/xxx)"
              className="w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={handleLoadDeck}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm disabled:opacity-50"
            >
              Load
            </button>
          </div>
        )}

        <div className="mt-3">
          <label className="text-xs text-neutral-500">Commander (optional)</label>
          <input
            type="text"
            value={commander ?? ""}
            onChange={(e) => setCommander(e.target.value || null)}
            placeholder="e.g. Giada, Font of Hope"
            className="w-full mt-1 bg-neutral-950 border border-neutral-600 rounded px-3 py-1.5 text-sm"
          />
        </div>
      </section>

      {/* Hand Simulator */}
      <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <h2 className="font-semibold text-neutral-200 mb-3">Hand Simulator</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={handleDraw7}
            disabled={parsedCards.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50"
          >
            Draw 7
          </button>
          <button
            onClick={() => handleMulliganTo(6)}
            disabled={currentHand.length === 0}
            className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm disabled:opacity-50"
          >
            Mulligan to 6
          </button>
          <button
            onClick={() => handleMulliganTo(5)}
            disabled={currentHand.length === 0}
            className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm disabled:opacity-50"
          >
            Mulligan to 5
          </button>
          <button
            onClick={() => handleMulliganTo(4)}
            disabled={currentHand.length === 0}
            className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm disabled:opacity-50"
          >
            Mulligan to 4
          </button>
        </div>
        {currentHand.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-neutral-500">
              Current hand ({currentHand.length} cards) • {mulliganCount} mulligan{mulliganCount !== 1 ? "s" : ""}
            </div>
            <ul className="list-disc list-inside text-sm text-neutral-300">
              {currentHand.map((name, i) => (
                <li key={`${name}-${i}`}>{name}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Context Controls */}
      <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <h2 className="font-semibold text-neutral-200 mb-3">Context</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">Play / Draw</span>
            <select
              value={playDraw}
              onChange={(e) => setPlayDraw(e.target.value as "play" | "draw")}
              className="bg-neutral-950 border border-neutral-600 rounded px-2 py-1 text-sm"
            >
              <option value="play">On the play</option>
              <option value="draw">On the draw</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">Mulligan count</span>
            <input
              type="number"
              min={0}
              max={3}
              value={mulliganCount}
              onChange={(e) => setMulliganCount(Math.max(0, Math.min(3, parseInt(e.target.value, 10) || 0)))}
              className="w-16 bg-neutral-950 border border-neutral-600 rounded px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">Model</span>
            <select
              value={modelTier}
              onChange={(e) => setModelTier(e.target.value as "mini" | "full")}
              className="bg-neutral-950 border border-neutral-600 rounded px-2 py-1 text-sm"
            >
              <option value="mini">Mini (cheap)</option>
              <option value="full">Full (best)</option>
            </select>
          </label>
        </div>
      </section>

      {/* AI Advice */}
      <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <h2 className="font-semibold text-neutral-200 mb-3">AI Advice</h2>
        <button
          onClick={handleGetAdvice}
          disabled={loading || currentHand.length === 0}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-medium rounded text-sm disabled:opacity-50"
        >
          {loading ? "Loading…" : "Get AI Advice"}
        </button>

        {error && (
          <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 p-4 bg-neutral-800 rounded-lg border border-neutral-600 space-y-3">
            <div className="flex items-center gap-2">
              <span
                className={`font-bold text-lg ${result.action === "KEEP" ? "text-green-400" : "text-red-400"}`}
              >
                {result.action}
              </span>
              {result.confidence != null && (
                <span className="text-sm text-neutral-400">{result.confidence}% confidence</span>
              )}
              {result.model && (
                <span className="text-xs text-neutral-500 ml-auto">{result.model}</span>
              )}
            </div>
            {result.reasons.length > 0 && (
              <ul className="list-disc list-inside text-sm text-neutral-300 space-y-1">
                {result.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            {result.suggestedLine && (
              <div className="text-sm text-amber-200/90 italic">
                Ideal first 2 turns: {result.suggestedLine}
              </div>
            )}
            {result.warnings && result.warnings.length > 0 && (
              <div className="text-xs text-amber-400">
                Warnings: {result.warnings.join("; ")}
              </div>
            )}
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              {showRaw ? "Hide" : "Show"} raw JSON
            </button>
            {showRaw && rawJson && (
              <pre className="mt-2 p-2 bg-neutral-950 rounded text-xs overflow-auto max-h-48 font-mono text-neutral-400">
                {rawJson}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

