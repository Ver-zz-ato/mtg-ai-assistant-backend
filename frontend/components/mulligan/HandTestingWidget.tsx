"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useProStatus } from "@/hooks/useProStatus";
import {
  trackProGateViewed,
  trackProGateClicked,
  trackProUpgradeStarted,
  trackProFeatureUsed,
} from "@/lib/analytics-pro";
import { capture } from "@/lib/ph";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { parseDecklist } from "@/lib/mulligan/parse-decklist";
import { SAMPLE_DECKS } from "@/lib/sample-decks";

type Card = {
  name: string;
  qty: number;
  image_url?: string;
  mana_cost?: string;
  type_line?: string;
};

type HandCard = {
  name: string;
  image_url?: string;
  mana_cost?: string;
  type_line?: string;
  id: string;
};

type TestSequence = {
  id: string;
  timestamp: number;
  decisions: Array<{
    hand: HandCard[];
    decision: "keep" | "mulligan";
    handSize: number;
    mulliganCount: number;
  }>;
  finalDecision: "keep" | "none";
  deckSnapshot: string;
};

export type HandTestingWidgetProps = {
  mode: "DEMO" | "DECK";
  deckId?: string;
  decklistText?: string;
  deckCards?: Array<{ name: string; qty: number }>;
  commanderName?: string | null;
  format?: "Commander" | "Standard";
  compact?: boolean;
  placement?: "HOME" | "DECK_PAGE" | "MULLIGAN_PAGE";
  className?: string;
};

/** Parse sample deck list into { name, qty }[] */
function parseSampleDeckList(deckList: string): Array<{ name: string; qty: number }> {
  const parsed = parseDecklist(deckList);
  return parsed.map((p) => ({ name: p.name, qty: p.count }));
}

/** Get demo deck cards from first sample deck */
function getDemoDeckCards(): Array<{ name: string; qty: number }> {
  const first = SAMPLE_DECKS[0];
  if (!first?.deckList) return [];
  return parseSampleDeckList(first.deckList);
}

/** Stacked cards icon for Hand Testing */
function CardsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="16" height="20" rx="2" />
      <rect x="6" y="2" width="16" height="20" rx="2" />
      <rect x="10" y="6" width="10" height="14" rx="1" />
    </svg>
  );
}

export default function HandTestingWidget({
  mode,
  deckId,
  decklistText,
  deckCards: deckCardsProp,
  commanderName,
  format = "Commander",
  compact = false,
  placement = "DECK_PAGE",
  className = "",
}: HandTestingWidgetProps) {
  const { isPro, loading: proLoading } = useProStatus();
  const [resolvedDeckCards, setResolvedDeckCards] = useState<
    Array<{ name: string; qty: number }>
  >([]);
  const [deckResolveLoading, setDeckResolveLoading] = useState(false);
  const [deckResolveError, setDeckResolveError] = useState<string | null>(null);

  const [currentHand, setCurrentHand] = useState<HandCard[]>([]);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [gameState, setGameState] = useState<
    "initial" | "drawing" | "viewing" | "finished"
  >("initial");
  const [testSequence, setTestSequence] = useState<TestSequence | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [cardImages, setCardImages] = useState<
    Record<string, { small?: string; normal?: string; mana_cost?: string; type_line?: string }>
  >({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesRequested, setImagesRequested] = useState(false);
  const [pv, setPv] = useState<{
    src: string;
    x: number;
    y: number;
    shown: boolean;
    below: boolean;
  }>({ src: "", x: 0, y: 0, shown: false, below: false });
  const [freeRunsRemaining, setFreeRunsRemaining] = useState<number | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceResult, setAdviceResult] = useState<{
    action: "KEEP" | "MULLIGAN";
    confidence?: number;
    reasons: string[];
    suggestedLine?: string;
  } | null>(null);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [ghostHandExiting, setGhostHandExiting] = useState(false);
  const [aiTeaserTooltip, setAiTeaserTooltip] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const canRun =
    proLoading === false &&
    (isPro || (freeRunsRemaining !== null && freeRunsRemaining > 0));

  // Deck source resolver
  useEffect(() => {
    if (mode === "DEMO") {
      setResolvedDeckCards(getDemoDeckCards());
      setDeckResolveError(null);
      return;
    }

    if (deckCardsProp && deckCardsProp.length > 0) {
      setResolvedDeckCards(deckCardsProp);
      setDeckResolveError(null);
      return;
    }

    if (decklistText?.trim()) {
      const parsed = parseDecklist(decklistText).map((p) => ({
        name: p.name,
        qty: p.count,
      }));
      if (parsed.length > 0) {
        setResolvedDeckCards(parsed);
        setDeckResolveError(null);
      } else {
        setResolvedDeckCards([]);
        setDeckResolveError("No cards detected in decklist");
      }
      return;
    }

    if (deckId) {
      setDeckResolveLoading(true);
      setDeckResolveError(null);
      fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((j) => {
          const cards = Array.isArray(j?.cards) ? j.cards : [];
          setResolvedDeckCards(cards);
          if (cards.length === 0 && !j?.ok) {
            setDeckResolveError(j?.error || "Failed to load deck");
          }
        })
        .catch(() => {
          setResolvedDeckCards([]);
          setDeckResolveError("Failed to load deck");
        })
        .finally(() => setDeckResolveLoading(false));
      return;
    }

    setResolvedDeckCards([]);
    setDeckResolveError(null);
  }, [mode, deckId, decklistText, deckCardsProp]);

  // Free runs
  useEffect(() => {
    if (proLoading) return;
    if (isPro) {
      setFreeRunsRemaining(null);
      return;
    }
    try {
      const stored = localStorage.getItem("hand_testing_free_runs");
      const count = stored ? parseInt(stored, 10) : 3;
      setFreeRunsRemaining(Math.max(0, count));
    } catch {
      setFreeRunsRemaining(3);
    }
  }, [isPro, proLoading]);

  const expandedDeck = useMemo(() => {
    const out: Card[] = [];
    for (const card of resolvedDeckCards) {
      for (let i = 0; i < (card.qty || 1); i++) {
        out.push(card);
      }
    }
    return out;
  }, [resolvedDeckCards]);

  const shouldLazyLoadImages = placement === "HOME";
  const triggerImageLoad = useCallback(() => {
    setImagesRequested(true);
  }, []);

  // IntersectionObserver for homepage: load images when widget scrolls into view
  useEffect(() => {
    if (!shouldLazyLoadImages || !containerRef.current) return;
    const el = containerRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setImagesRequested(true);
      },
      { threshold: 0.1, rootMargin: "50px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [shouldLazyLoadImages]);

  // Fetch images: immediately for non-HOME, or when requested/in-view for HOME
  const shouldFetchImages =
    canRun &&
    resolvedDeckCards.length > 0 &&
    (!shouldLazyLoadImages || imagesRequested);

  useEffect(() => {
    if (!shouldFetchImages) return;

    const fetchCardImages = async () => {
      setImagesLoading(true);
      try {
        const uniqueNames = Array.from(
          new Set(resolvedDeckCards.map((c) => c.name))
        ).slice(0, 200);
        if (uniqueNames.length === 0) return;

        let response;
        try {
          response = await fetch("/api/cards/batch-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: uniqueNames }),
          });
        } catch {
          const identifiers = uniqueNames.map((name) => ({ name: name.trim() }));
          response = await fetch("https://api.scryfall.com/cards/collection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifiers }),
          });
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data?.data && Array.isArray(data.data)) {
          const imageMap: Record<string, { small?: string; normal?: string; mana_cost?: string; type_line?: string }> = {};
          const { fetchEnglishCardImages } = await import("@/lib/scryfall");
          for (let idx = 0; idx < data.data.length; idx++) {
            const card = data.data[idx] as { name?: string; lang?: string; image_uris?: Record<string, string>; card_faces?: Array<{ image_uris?: Record<string, string> }>; mana_cost?: string; type_line?: string };
            const requestedName = uniqueNames[idx]?.trim();
            const key = (requestedName || card.name || "").toLowerCase().trim();
            if (!key) continue;
            let images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
            if (card.lang && card.lang !== "en" && requestedName) {
              const enInfo = await fetchEnglishCardImages(requestedName);
              if (enInfo?.normal || enInfo?.small) {
                const s = enInfo.small ?? enInfo.normal;
                const n = enInfo.normal ?? enInfo.small;
                if (s && n) images = { small: s, normal: n, large: n };
              }
            }
            imageMap[key] = {
              small: images.small || images.normal,
              normal: images.normal || (images as { large?: string }).large,
              mana_cost: card.mana_cost || "",
              type_line: card.type_line || "",
            };
          }
          setCardImages(imageMap);
        }
      } catch {
        // Silently fail
      } finally {
        setImagesLoading(false);
      }
    };

    fetchCardImages();
  }, [resolvedDeckCards, canRun, shouldFetchImages]);

  const shuffleDeck = useCallback((deck: Card[]): Card[] => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const calcPos = useCallback((e: MouseEvent | React.MouseEvent) => {
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
      const x = Math.min(
        vw - margin - half,
        Math.max(margin + half, rawX)
      );
      const y = below
        ? Math.min(vh - margin, rawY + margin)
        : Math.max(margin + 1, rawY - margin);
      return { x, y, below };
    } catch {
      const ev = e as { clientX?: number; clientY?: number };
      return {
        x: ev?.clientX ?? 0,
        y: ev?.clientY ?? 0,
        below: false,
      };
    }
  }, []);

  const drawHand = useCallback(
    (size: number): HandCard[] => {
      const shuffled = shuffleDeck(expandedDeck);
      return shuffled.slice(0, size).map((card, index) => {
        const normalizedName = card.name.toLowerCase()?.trim();
        const cardData = cardImages[normalizedName] || {};
        return {
          ...card,
          id: `${Date.now()}-${index}-${Math.random()}`,
          image_url: compact
            ? cardData.small || cardData.normal
            : cardData.normal || cardData.small,
          mana_cost: cardData.mana_cost || card.mana_cost,
          type_line: cardData.type_line || card.type_line,
        };
      });
    },
    [expandedDeck, cardImages, compact, shuffleDeck]
  );

  const startHandTest = useCallback(async () => {
    if (!canRun) return;
    if (shouldLazyLoadImages && !imagesRequested) triggerImageLoad();

    if (!isPro && freeRunsRemaining !== null && freeRunsRemaining > 0) {
      const newCount = freeRunsRemaining - 1;
      setFreeRunsRemaining(newCount);
      try {
        localStorage.setItem("hand_testing_free_runs", String(newCount));
      } catch {}
    }

    if (imagesLoading || Object.keys(cardImages).length === 0) {
      if (Object.keys(cardImages).length === 0) {
        setTimeout(() => startHandTest(), 500);
      }
      return;
    }

    trackProFeatureUsed("hand_testing");
    setIsAnimating(true);
    setGameState("drawing");
    setMulliganCount(0);
    setAdviceResult(null);
    setAdviceError(null);

    try {
      await fetch("/api/stats/activity/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mulligan_ran",
          message: "Mulligan simulation run",
        }),
      });
    } catch {}

    const newSequence: TestSequence = {
      id: `test-${Date.now()}`,
      timestamp: Date.now(),
      decisions: [],
      finalDecision: "none",
      deckSnapshot: expandedDeck.slice(0, 10).map((c) => c.name).join(", "),
    };
    setTestSequence(newSequence);

    await new Promise((r) => setTimeout(r, 1000));
    const hand = drawHand(7);
    setCurrentHand(hand);
    setGameState("viewing");
    setIsAnimating(false);

    capture(AnalyticsEvents.MULLIGAN_HAND_DRAWN, {
      placement,
      is_pro: isPro,
      deck_size: expandedDeck.length,
      hand_size: 7,
    }, { isAuthenticated: !!isPro || freeRunsRemaining !== null });
  }, [
    canRun,
    isPro,
    freeRunsRemaining,
    imagesLoading,
    cardImages,
    expandedDeck,
    drawHand,
    shouldLazyLoadImages,
    imagesRequested,
    triggerImageLoad,
  ]);

  const handleDecision = useCallback(
    (decision: "keep" | "mulligan") => {
      if (!testSequence || !canRun) return;

      capture(AnalyticsEvents.MULLIGAN_DECISION, {
        placement,
        is_pro: isPro,
        decision,
        hand_size: currentHand.length,
        mulligan_count: mulliganCount,
      }, { isAuthenticated: !!isPro || freeRunsRemaining !== null });

      const newDecision = {
        hand: [...currentHand],
        decision,
        handSize: currentHand.length,
        mulliganCount,
      };
      const updatedSequence = {
        ...testSequence,
        decisions: [...testSequence.decisions, newDecision],
      };

      if (decision === "keep") {
        updatedSequence.finalDecision = "keep";
        setTestSequence(updatedSequence);
        setGameState("finished");
        return;
      }

      if (mulliganCount >= 6) {
        updatedSequence.finalDecision = "keep";
        setTestSequence(updatedSequence);
        setGameState("finished");
        return;
      }

      setAdviceResult(null);
      setAdviceError(null);
      setIsAnimating(true);
      setGameState("drawing");
      const nextMulliganCount = mulliganCount + 1;
      const nextHandSize =
        format === "Commander" && mulliganCount === 0
          ? 7
          : Math.max(1, 7 - nextMulliganCount);

      setMulliganCount(nextMulliganCount);

      setTimeout(() => {
        const newHand = drawHand(nextHandSize);
        setCurrentHand(newHand);
        setGameState("viewing");
        setIsAnimating(false);
        setTestSequence(updatedSequence);
      }, 800);
    },
    [testSequence, canRun, currentHand, mulliganCount, format, drawHand, placement, isPro]
  );

  const handleGetAdvice = useCallback(async () => {
    if (currentHand.length === 0 || resolvedDeckCards.length === 0) return;
    setAdviceLoading(true);
    setAdviceError(null);
    setAdviceResult(null);

    capture(AnalyticsEvents.MULLIGAN_ADVICE_REQUESTED, {
      placement,
      is_pro: isPro,
      hand_size: currentHand.length,
      mulligan_count: mulliganCount,
    }, { isAuthenticated: !!isPro || freeRunsRemaining !== null });

    try {
      const res = await fetch("/api/mulligan/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hand: currentHand.map((c) => c.name),
          deck: {
            cards: resolvedDeckCards.map((c) => ({ name: c.name, count: c.qty || 1 })),
            commander: commanderName ?? null,
          },
          playDraw: "play",
          mulliganCount,
          format: "commander",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setAdviceError(data.error || "Daily limit reached. Sign in or upgrade for more!");
        } else {
          setAdviceError(data.error || "Failed to get advice");
        }
        return;
      }
      if (data.ok && data.action) {
        setAdviceResult({
          action: data.action,
          confidence: data.confidence,
          reasons: data.reasons || [],
          suggestedLine: data.suggestedLine,
        });
        capture(AnalyticsEvents.MULLIGAN_ADVICE_RECEIVED, {
          placement,
          is_pro: isPro,
          action: data.action,
          confidence: data.confidence,
        }, { isAuthenticated: !!isPro || freeRunsRemaining !== null });
      }
    } catch (e) {
      setAdviceError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAdviceLoading(false);
    }
  }, [currentHand, resolvedDeckCards, commanderName, mulliganCount, placement, isPro, freeRunsRemaining]);

  const shareSequence = useCallback(() => {
    if (!testSequence) return;
    const shareText = `Hand Testing Sequence - ${testSequence.decisions.length} decisions, Final: ${testSequence.finalDecision}`;
    const baseUrl =
      typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "https://www.manatap.ai"
        : typeof window !== "undefined"
          ? window.location.origin
          : "";
    if (navigator.share) {
      navigator.share({
        title: "MTG Hand Test Results",
        text: shareText,
        url: `${baseUrl}/hand-test/${testSequence.id}`,
      });
    } else {
      navigator.clipboard?.writeText(shareText);
      setShowShareModal(true);
      setTimeout(() => setShowShareModal(false), 3000);
    }
  }, [testSequence]);

  useEffect(() => {
    if (!isPro && freeRunsRemaining === 0 && !proLoading) {
      trackProGateViewed("hand_testing", "widget_display", { is_pro: false });
    }
  }, [isPro, freeRunsRemaining, proLoading]);

  const shouldShowProGate =
    !proLoading &&
    !isPro &&
    freeRunsRemaining !== null &&
    freeRunsRemaining === 0;

  const showEmptyState =
    mode === "DECK" &&
    resolvedDeckCards.length === 0 &&
    !deckResolveLoading;

  if (proLoading) {
    return (
      <div
        ref={containerRef}
        className={`rounded-lg border border-neutral-700 bg-neutral-900/80 p-4 w-full min-w-0 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center">
            <CardsIcon className="w-4 h-4 text-neutral-400" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-200">🃏 Mulligan Simulator</h3>
            <p className="text-xs text-neutral-500">Checking Pro status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (shouldShowProGate) {
    return (
      <div
        ref={containerRef}
        className={`rounded-lg border border-neutral-700 bg-neutral-900/80 p-4 ${className}`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0">
            <CardsIcon className="w-4 h-4 text-neutral-400" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-200">🃏 Mulligan Simulator</h3>
            <p className="text-sm text-neutral-400">
              You&apos;ve used your 3 free runs. Upgrade to Pro for unlimited access!
            </p>
          </div>
          <span className="ml-auto inline-flex items-center rounded bg-amber-600/80 text-black text-[10px] font-bold px-2 py-1 uppercase">
            PRO
          </span>
        </div>
        <div className="text-center">
          <button
            onClick={() => {
              trackProGateClicked("hand_testing", "widget_display");
              trackProUpgradeStarted("gate", {
                feature: "hand_testing",
                location: "widget_display",
              });
              window.location.href = "/pricing";
            }}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-black font-medium rounded-lg transition-colors"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  if (showEmptyState || deckResolveError) {
    return (
      <div
        ref={containerRef}
        className={`rounded-lg border border-neutral-700 bg-neutral-900/80 p-4 w-full min-w-0 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0">
            <CardsIcon className="w-4 h-4 text-neutral-400" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-200">🃏 Mulligan Simulator</h3>
            <p className="text-xs text-neutral-500">
              {deckResolveError ||
                (placement === "MULLIGAN_PAGE"
                  ? "Paste a decklist above to test hands"
                  : "Load a deck to test hands")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (deckResolveLoading && resolvedDeckCards.length === 0) {
    return (
      <div
        ref={containerRef}
        className={`rounded-lg border border-neutral-700 bg-neutral-900/80 p-4 w-full min-w-0 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0">
            <div className="w-4 h-4 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-200">🃏 Mulligan Simulator</h3>
            <p className="text-xs text-neutral-500">Loading deck...</p>
          </div>
        </div>
      </div>
    );
  }

  const statusText = imagesLoading
    ? "Loading card images..."
    : Object.keys(cardImages).length === 0
      ? "Waiting for card images..."
      : gameState === "initial"
        ? `${expandedDeck.length} cards / ${Object.keys(cardImages).length} unique images loaded`
        : gameState === "finished"
          ? `Test complete (${mulliganCount} mulligans)`
          : `Testing... (${mulliganCount} mulligans)`;

  const showFreeMulliganButton =
    format === "Commander" &&
    mulliganCount === 0 &&
    currentHand.length === 7 &&
    gameState === "viewing";

  const mulliganButtonLabel = showFreeMulliganButton
    ? "Free mulligan (redraw 7)"
    : mulliganCount >= 6
      ? "Must Keep"
      : "Mulligan";

  const isReadyToDraw =
    canRun &&
    gameState === "initial" &&
    !isAnimating &&
    !imagesLoading &&
    expandedDeck.length >= 7 &&
    (Object.keys(cardImages).length > 0 || (placement === "HOME" && !imagesRequested));

  const handleDrawClick = async () => {
    if (
      gameState === "initial" &&
      !ghostHandExiting &&
      canRun &&
      !isAnimating &&
      !imagesLoading &&
      expandedDeck.length >= 7 &&
      (Object.keys(cardImages).length > 0 || (placement === "HOME" && !imagesRequested))
    ) {
      setGhostHandExiting(true);
      await new Promise((r) => setTimeout(r, 250));
      setGhostHandExiting(false);
    }
    await startHandTest();
  };

  const handleAiTeaserClick = () => {
    if (gameState !== "viewing" || currentHand.length === 0) {
      setAiTeaserTooltip(true);
      setTimeout(() => setAiTeaserTooltip(false), 2500);
    } else {
      const el = document.querySelector("[data-ai-advice-btn]");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`rounded-lg border border-neutral-700 bg-neutral-900/80 p-4 sm:p-5 w-full min-w-0 hover:shadow-lg hover:shadow-neutral-900/50 transition-shadow duration-200 group ${compact ? "p-3" : ""} ${className}`}
    >
      {/* Idle state: ghost hand + CTA + AI teaser */}
      {gameState === "initial" && (
        <div
          className={`flex flex-col md:flex-row items-center gap-6 md:gap-8 py-4 md:py-6 ${ghostHandExiting ? "ghost-hand-exiting" : ""}`}
        >
          {/* Ghost hand preview - fanned card backs (larger) */}
          <div className="flex flex-col items-center shrink-0 order-2 md:order-1">
            <div className="relative h-24 w-40 md:h-32 md:w-52 flex justify-center items-end">
              <div
                className="absolute inset-0 rounded-full opacity-15 blur-2xl bg-amber-500/40 group-hover:opacity-25 transition-opacity duration-200 pointer-events-none"
                style={{ width: "160%", left: "-30%", top: "10%" }}
              />
              {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                const w = 36;
                const h = 50;
                return (
                  <div
                    key={i}
                    className="ghost-hand-card absolute rounded-md border border-neutral-600/70 bg-gradient-to-br from-neutral-800 to-neutral-900"
                    style={{
                      width: w,
                      height: h,
                      left: `calc(50% - ${w / 2}px + ${(i - 3) * 18}px)`,
                      bottom: 0,
                      transform: `rotate(${(i - 3) * 6}deg)`,
                      filter: "blur(0.5px)",
                      opacity: 0.8,
                      transformOrigin: "bottom center",
                    }}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-neutral-600 mt-2">Ready to draw 7</p>
          </div>

          {/* CTA block - header moved to parent */}
          <div className="flex flex-col items-center md:items-start gap-3 flex-1 min-w-0 order-1 md:order-2">
            <div className="flex items-center gap-3 min-w-0 w-full md:justify-start justify-center">
              <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0 text-neutral-300">
                {imagesLoading ? (
                  <div className="w-4 h-4 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CardsIcon className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-neutral-500 truncate">
                  {imagesLoading ? "Loading..." : `${expandedDeck.length} cards`}
                </p>
                {!isPro && freeRunsRemaining !== null && freeRunsRemaining > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">
                    {freeRunsRemaining} free run{freeRunsRemaining !== 1 ? "s" : ""} remaining
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center md:items-start gap-2 w-full md:w-auto">
              <button
                onClick={handleDrawClick}
                disabled={
                  isAnimating ||
                  imagesLoading ||
                  expandedDeck.length < 7 ||
                  (Object.keys(cardImages).length === 0 &&
                    !(placement === "HOME" && !imagesRequested))
                }
                className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
                  isAnimating ||
                  imagesLoading ||
                  expandedDeck.length < 7 ||
                  (Object.keys(cardImages).length === 0 &&
                    !(placement === "HOME" && !imagesRequested))
                    ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
                    : "bg-amber-600 hover:bg-amber-500 text-black"
                }`}
              >
                {imagesLoading
                  ? "Loading..."
                  : Object.keys(cardImages).length === 0 &&
                      !(placement === "HOME" && !imagesRequested)
                    ? "Waiting for Images..."
                    : "Draw Opening Hand"}
              </button>
              {/* AI advice teaser - prominent */}
              <div className="relative">
                <button
                  type="button"
                  onClick={handleAiTeaserClick}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/60 text-amber-200/90 hover:text-amber-100 text-sm font-medium transition-all"
                >
                  <span aria-hidden className="text-base">🧠</span>
                  Want help? Get AI advice for any opening hand.
                </button>
                {aiTeaserTooltip && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 text-xs text-neutral-300 whitespace-nowrap z-10 shadow-xl">
                    Draw a hand first, then click Get AI Advice.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Non-initial: header row + actions (viewing/finished) */}
      {gameState !== "initial" && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0 text-neutral-300">
              <CardsIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-neutral-200">🃏 Mulligan Simulator</h3>
              <p className="text-xs text-neutral-500 truncate">
                Testing: {commanderName ?? "Deck"} · {expandedDeck.length} cards
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            {testSequence && gameState === "finished" && (
              <button
                onClick={shareSequence}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
              >
                Share
              </button>
            )}
            <button
              onClick={handleDrawClick}
              disabled={
                isAnimating ||
                imagesLoading ||
                expandedDeck.length < 7 ||
                (Object.keys(cardImages).length === 0 &&
                  !(placement === "HOME" && !imagesRequested))
              }
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isAnimating ||
                imagesLoading ||
                expandedDeck.length < 7 ||
                (Object.keys(cardImages).length === 0 &&
                  !(placement === "HOME" && !imagesRequested))
                  ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-500 text-black"
              }`}
            >
              {isAnimating ? "Shuffling..." : "New Test"}
            </button>
          </div>
        </div>
      )}

      {(gameState === "viewing" || gameState === "finished") &&
        currentHand.length > 0 && (
          <div className="mb-4">
            <div className="mb-2">
              <h4 className="text-sm font-medium text-neutral-200">
                Hand #{testSequence ? testSequence.decisions.length + 1 : 1}
              </h4>
              <p className="text-xs text-neutral-500">
                {mulliganCount} mulligan{mulliganCount !== 1 ? "s" : ""} taken
              </p>
              <p className="text-xs text-neutral-500">Deck: {commanderName ?? "Deck"}</p>
            </div>
            <div
              className={`grid gap-4 p-2 justify-items-center transition-all duration-500 [&>*]:transition-all [&>*]:duration-300 [&>*]:hover:scale-[1.02] ${
                isAnimating ? "scale-95 opacity-50" : "scale-100 opacity-100"
              } ${
                currentHand.length === 1
                  ? "grid-cols-1"
                  : currentHand.length === 2
                    ? "grid-cols-2"
                    : currentHand.length === 3
                      ? "grid-cols-3"
                      : "grid-cols-4"
              }`}
            >
              {currentHand.map((card) => (
                <div
                  key={card.id}
                  className={`bg-neutral-800 border border-neutral-600 rounded-lg overflow-hidden hover:border-neutral-500 group relative transition-transform duration-200 ${
                    compact ? "w-20" : "w-24 sm:w-28 md:w-32"
                  }`}
                  style={{ aspectRatio: "63/88" }}
                  title={card.name}
                >
                  {card.image_url ? (
                    <div className="relative w-full h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={card.image_url}
                        alt={card.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onMouseEnter={(e) => {
                          const { x, y, below } = calcPos(e);
                          const normalizedName = card.name.toLowerCase()?.trim();
                          const fullImage =
                            cardImages[normalizedName]?.normal ||
                            card.image_url ||
                            "";
                          setPv({ src: fullImage, x, y, shown: true, below });
                        }}
                        onMouseMove={(e) => {
                          const { x, y, below } = calcPos(e);
                          setPv((p) => (p.shown ? { ...p, x, y, below } : p));
                        }}
                        onMouseLeave={() =>
                          setPv((p) => ({ ...p, shown: false }))
                        }
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                        <div className="text-xs font-medium text-white truncate">
                          {card.name}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col justify-center p-2">
                      <div
                        className={`font-medium text-white text-center ${
                          compact ? "text-xs" : "text-sm"
                        }`}
                        title={card.name}
                      >
                        {card.name}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {gameState === "viewing" && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <button
                    onClick={() => handleDecision("keep")}
                    className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md font-medium transition-colors"
                  >
                    Keep Hand
                  </button>
                  <button
                    onClick={() => handleDecision("mulligan")}
                    disabled={mulliganCount >= 6}
                    className={`px-6 py-2 rounded-md font-medium transition-colors border ${
                      mulliganCount >= 6
                        ? "bg-neutral-700 text-neutral-400 cursor-not-allowed border-neutral-600"
                        : "bg-transparent border-amber-600/60 text-amber-200 hover:bg-amber-600/20 hover:border-amber-500/80"
                    }`}
                    title={
                      showFreeMulliganButton
                        ? "Commander: first mulligan is free, redraw 7"
                        : undefined
                    }
                  >
                    {mulliganButtonLabel}
                  </button>
                </div>
                <p className="text-[10px] text-neutral-600 text-center">London mulligan rule.</p>
                <div className="text-center pt-3">
                  <p className="text-sm font-medium text-amber-200/90 mb-2">Need help deciding?</p>
                  <button
                    data-ai-advice-btn
                    onClick={handleGetAdvice}
                    disabled={adviceLoading}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25 hover:border-amber-500/80 text-amber-100 font-medium transition-all"
                  >
                    <span aria-hidden className="text-lg">🧠</span>
                    {adviceLoading ? "Loading…" : "Get AI Advice on this hand"}
                  </button>
                </div>
                {adviceError && (
                  <div className="text-sm text-red-400 text-center">{adviceError}</div>
                )}
                {adviceResult && (
                  <div className="p-3 bg-neutral-800 rounded-lg border border-neutral-600 text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`font-bold ${
                          adviceResult.action === "KEEP" ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {adviceResult.action}
                      </span>
                      {adviceResult.confidence != null && (
                        <span className="text-neutral-400">{adviceResult.confidence}% confidence</span>
                      )}
                    </div>
                    {adviceResult.reasons.length > 0 && (
                      <ul className="list-disc list-inside text-neutral-300 space-y-1">
                        {adviceResult.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                    {adviceResult.suggestedLine && (
                      <p className="text-amber-200/90 italic mt-2">
                        Ideal first 2 turns: {adviceResult.suggestedLine}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {isAnimating && gameState === "drawing" && (
        <div className="flex justify-center py-8">
          <div className="flex space-x-1">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="w-12 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-md animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>
        </div>
      )}

      {testSequence && gameState === "finished" && (
        <div className="bg-neutral-800 rounded-md p-3 mt-4">
          <h4 className="text-sm font-medium mb-2">Test Results</h4>
          <div className="space-y-1 text-xs">
            <p>Final decision: Keep</p>
            <p>Mulligans taken: {mulliganCount}</p>
            <p>Final hand size: {currentHand.length}</p>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg z-50">
          Results copied to clipboard!
        </div>
      )}
      {pv.shown && typeof window !== "undefined" && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: pv.x,
            top: pv.y,
            transform: `translate(-50%, ${pv.below ? "0%" : "-100%"})`,
          }}
        >
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80 min-w-[18rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pv.src}
              alt="preview"
              className="block w-full h-auto max-h-[70vh] object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
