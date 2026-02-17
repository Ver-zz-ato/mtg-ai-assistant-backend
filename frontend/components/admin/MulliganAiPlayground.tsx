"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  parseDecklist,
  getTotalCards,
  getUniqueCount,
  type ParsedCard,
} from "@/lib/mulligan/parse-decklist";
import { capture, hasConsent } from "@/lib/ph";

type DeckRow = { id: string; title?: string | null };

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
  const [decks, setDecks] = useState<DeckRow[]>([]);
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

  const [cardImages, setCardImages] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [pv, setPv] = useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({
    src: "",
    x: 0,
    y: 0,
    shown: false,
    below: false,
  });

  const calcPos = useCallback((e: React.MouseEvent | MouseEvent) => {
    try {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const boxW = 320;
      const boxH = 460;
      const half = boxW / 2;
      const rawX = (e as React.MouseEvent).clientX;
      const rawY = (e as React.MouseEvent).clientY;
      const below = rawY - boxH - margin < 0;
      const x = Math.min(vw - margin - half, Math.max(margin + half, rawX));
      const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin);
      return { x, y, below };
    } catch {
      const ev = e as React.MouseEvent;
      return { x: ev?.clientX ?? 0, y: ev?.clientY ?? 0, below: false };
    }
  }, []);

  // Fetch decks list for dropdown (same as ImportDeckForMath / budget swaps)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks/my", { cache: "no-store" });
        const json = await res.json().catch(() => ({ ok: false }));
        if (res.ok && json?.ok && Array.isArray(json.decks)) {
          setDecks(json.decks);
        }
      } catch {}
    })();
  }, []);

  // Fetch card images when we have cards (like HandTestingWidget)
  useEffect(() => {
    const names = parsedCards.length > 0
      ? Array.from(new Set(parsedCards.map((c) => c.name))).slice(0, 200)
      : [];
    if (names.length === 0) return;

    let cancelled = false;
    setImagesLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/cards/batch-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        const map: Record<string, { small?: string; normal?: string }> = {};
        if (data?.data && Array.isArray(data.data)) {
          for (const card of data.data) {
            const name = (card.name || "").toLowerCase().trim();
            const img = card.image_uris || card.card_faces?.[0]?.image_uris || {};
            if (name) map[name] = { small: img.small || img.normal, normal: img.normal || img.large };
          }
        }
        if (!cancelled) setCardImages(map);
      } catch {
        if (!cancelled) setCardImages({});
      } finally {
        if (!cancelled) setImagesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parsedCards]);

  const handleParse = useCallback(() => {
    const cards = parseDecklist(deckText);
    setParsedCards(cards);
    setError(null);
  }, [deckText]);

  const handleDeckSelect = useCallback(async (id: string) => {
    setDeckId(id);
    if (!id) {
      setParsedCards([]);
      setCommander(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(id)}`, {
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
      // Try to get commander from deck metadata
      try {
        const metaRes = await fetch(`/api/decks/get?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const meta = await metaRes.json().catch(() => ({}));
        const cmd = (meta?.deck as { commander?: string })?.commander;
        setCommander(cmd ? String(cmd).trim() || null : null);
      } catch {
        setCommander(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Commander: first mulligan free (redraw 7), then each costs a card: 7→7→6→5→4→3→2→1
  const handleFreeMulligan = useCallback(() => {
    if (parsedCards.length === 0 || currentHand.length !== 7 || mulliganCount !== 0) return;
    const expanded = expandDeck(parsedCards);
    if (expanded.length < 7) return;
    setCurrentHand(drawHand(expanded, 7));
    setMulliganCount(1);
    setResult(null);
    setError(null);
  }, [parsedCards, currentHand.length, mulliganCount]);

  const handleMulliganTo = useCallback(
    (size: number) => {
      if (parsedCards.length === 0) return;
      const expanded = expandDeck(parsedCards);
      if (expanded.length < size) return;
      setCurrentHand(drawHand(expanded, size));
      setHandSize(size);
      // mulliganCount: 7→1, 6→2, 5→3, 4→4, 3→5, 2→6, 1→7
      setMulliganCount(size === 7 ? 1 : 8 - size);
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
            <select
              value={deckId}
              onChange={(e) => handleDeckSelect(e.target.value)}
              disabled={loading}
              className="w-full bg-neutral-950 border border-neutral-600 rounded px-3 py-2 text-sm"
            >
              <option value="">
                {decks.length === 0 ? "Sign in to load your decks" : "Select a deck…"}
              </option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || "Untitled deck"}
                </option>
              ))}
            </select>
            {loading && <span className="text-xs text-neutral-500">Loading deck…</span>}
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

      {/* Hand Simulator - styled like Hand Testing Widget */}
      <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center">
              {imagesLoading ? (
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                "🃏"
              )}
            </div>
            <div>
              <h2 className="font-semibold text-amber-200">Hand Simulator</h2>
              <p className="text-xs text-neutral-400">
                {imagesLoading ? "Loading card images…" :
                 parsedCards.length === 0 ? "Load or paste a deck first" :
                 `${totalCards} cards • ${Object.keys(cardImages).length} images loaded • ${currentHand.length > 0 ? "Ready" : "Draw a hand"}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDraw7}
              disabled={parsedCards.length === 0}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-medium rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentHand.length === 0 ? "Draw Opening Hand" : "New Test"}
            </button>
            {currentHand.length > 0 && (
              <>
                {mulliganCount === 0 && currentHand.length === 7 && (
                  <button
                    onClick={handleFreeMulligan}
                    disabled={totalCards < 7}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm disabled:opacity-50"
                    title="Commander: first mulligan is free, redraw 7"
                  >
                    Free mulligan (redraw 7)
                  </button>
                )}
                {currentHand.length === 7 && mulliganCount >= 1 && totalCards >= 6 && (
                  <button
                    onClick={() => handleMulliganTo(6)}
                    className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm"
                  >
                    Mulligan to 6
                  </button>
                )}
                {currentHand.length === 6 && totalCards >= 5 && (
                  <button
                    onClick={() => handleMulliganTo(5)}
                    className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm"
                  >
                    Mulligan to 5
                  </button>
                )}
                {currentHand.length === 5 && totalCards >= 4 && (
                  <button
                    onClick={() => handleMulliganTo(4)}
                    className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm"
                  >
                    Mulligan to 4
                  </button>
                )}
                {currentHand.length === 4 && totalCards >= 3 && (
                  <button
                    onClick={() => handleMulliganTo(3)}
                    className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm"
                  >
                    Mulligan to 3
                  </button>
                )}
                {currentHand.length === 3 && totalCards >= 2 && (
                  <button
                    onClick={() => handleMulliganTo(2)}
                    className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm"
                  >
                    Mulligan to 2
                  </button>
                )}
                {currentHand.length === 2 && totalCards >= 1 && (
                  <button
                    onClick={() => handleMulliganTo(1)}
                    className="px-3 py-2 bg-neutral-600 hover:bg-neutral-500 text-white rounded text-sm"
                  >
                    Mulligan to 1
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {currentHand.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-3">
              Current Hand ({currentHand.length} cards)
              {mulliganCount > 0 && (
                <span className="ml-2 text-xs bg-orange-600 text-white px-2 py-0.5 rounded">
                  {mulliganCount} mulligan{mulliganCount !== 1 ? "s" : ""}
                </span>
              )}
            </h4>
            <div
              className={`grid gap-3 p-2 justify-items-center ${
                currentHand.length === 1 ? "grid-cols-1" :
                currentHand.length === 2 ? "grid-cols-2" :
                currentHand.length === 3 ? "grid-cols-3" :
                currentHand.length === 4 ? "grid-cols-4" :
                "grid-cols-4"
              }`}
            >
              {currentHand.map((name, i) => {
                const cardData = cardImages[name.toLowerCase()?.trim()];
                const imgUrl = cardData?.normal || cardData?.small;
                const fullImage = cardData?.normal || cardData?.small || "";
                return (
                  <div
                    key={`${name}-${i}`}
                    className="bg-neutral-800 border border-neutral-600 rounded-lg overflow-hidden hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/20 w-24 sm:w-28 md:w-32 relative"
                    style={{ aspectRatio: "63/88" }}
                    title={name}
                    onMouseEnter={(e) => {
                      if (fullImage) {
                        const { x, y, below } = calcPos(e);
                        setPv({ src: fullImage, x, y, shown: true, below });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (fullImage) {
                        const { x, y, below } = calcPos(e);
                        setPv((p) => (p.shown ? { ...p, x, y, below } : p));
                      }
                    }}
                    onMouseLeave={() => setPv((p) => ({ ...p, shown: false }))}
                  >
                    {imgUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgUrl}
                          alt={name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                          <div className="text-xs font-medium text-white truncate">{name}</div>
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex flex-col justify-center p-2">
                        <div className="font-medium text-white text-center text-sm truncate" title={name}>
                          {name}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
              max={7}
              value={mulliganCount}
              onChange={(e) => setMulliganCount(Math.max(0, Math.min(7, parseInt(e.target.value, 10) || 0)))}
              className="w-16 bg-neutral-950 border border-neutral-600 rounded px-2 py-1 text-sm"
              title="Commander: 0=initial, 1=free mulligan (7 cards), 2–7=paid mulligans (6 down to 1)"
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

      {/* Global hover preview for card images (same as Hand Testing Widget) */}
      {pv.shown && typeof window !== "undefined" && pv.src && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: pv.x,
            top: pv.y,
            transform: `translate(-50%, ${pv.below ? "0%" : "-100%"})`,
          }}
        >
          <div
            className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 transition-opacity duration-150 ease-out opacity-100"
            style={{ minWidth: "18rem" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pv.src}
              alt="preview"
              className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}

