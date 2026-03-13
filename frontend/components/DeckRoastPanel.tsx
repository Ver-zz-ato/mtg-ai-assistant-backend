"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import CardAutocomplete from "@/components/CardAutocomplete";
import ComputingModal from "@/components/ComputingModal";
import { getImagesForNames, type ImageInfo } from "@/lib/scryfall-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import Link from "next/link";

const ROAST_LEVELS = [
  { id: "gentle" as const, label: "Gentle", emoji: "🟢", savageness: 2 },
  { id: "balanced" as const, label: "Balanced", emoji: "🟡", savageness: 5 },
  { id: "spicy" as const, label: "Spicy", emoji: "🌶", savageness: 8 },
  { id: "savage" as const, label: "Savage", emoji: "🔥", savageness: 10 },
] as const;
type RoastLevelId = (typeof ROAST_LEVELS)[number]["id"];

function getLevelFromScore(score: number): (typeof ROAST_LEVELS)[number] {
  if (score <= 3) return ROAST_LEVELS[0];
  if (score <= 6) return ROAST_LEVELS[1];
  if (score <= 8) return ROAST_LEVELS[2];
  return ROAST_LEVELS[3];
}

export interface DeckRoastPanelProps {
  variant?: "panel" | "inline";
  showSignupCta?: boolean;
  /** Base path for share links (e.g. "/" for homepage, "/admin/tools/deck-roast" for admin) */
  sharePath?: string;
  /** When true, show compact trigger; click opens full content in a modal (for space-constrained sidebar) */
  useModal?: boolean;
}

export default function DeckRoastPanel({
  variant = "panel",
  showSignupCta = true,
  sharePath = "/",
  useModal = false,
}: DeckRoastPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState<"Commander" | "Modern" | "Pioneer" | "Standard">("Commander");
  const [commander, setCommander] = useState("");
  const [roastLevel, setRoastLevel] = useState<RoastLevelId>("balanced");
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roast, setRoast] = useState<string | null>(null);
  const [roastScore, setRoastScore] = useState<number | null>(null);
  const [commanderArt, setCommanderArt] = useState<string | null>(null);
  const [roastCardImages, setRoastCardImages] = useState<Map<string, ImageInfo>>(new Map());
  const [hoverCard, setHoverCard] = useState<{ src: string; name: string; x: number; y: number } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => setIsLoggedIn(!!data?.user))
      .catch(() => setIsLoggedIn(false));
  }, []);

  const HOVER_CARD_SIZE = "max-w-[280px] max-h-[400px]";

  function handleCardHoverEnter(e: React.MouseEvent, src: string, name: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const padding = 12;
    const cardW = 280;
    const cardH = 400;
    let x = rect.right + padding;
    let y = rect.top;
    if (typeof window !== "undefined") {
      if (x + cardW > window.innerWidth - padding) x = rect.left - cardW - padding;
      if (y + cardH > window.innerHeight - padding) y = Math.max(padding, window.innerHeight - cardH - padding);
      if (y < padding) y = padding;
    }
    setHoverCard({ src, name, x, y });
  }

  // Fetch commander art when commander is set (Commander format) – show immediately on select
  useEffect(() => {
    if (format !== "Commander" || !commander.trim()) {
      setCommanderArt(null);
      return;
    }
    (async () => {
      try {
        const map = await getImagesForNames([commander.trim()]);
        const first = Array.from(map.values())[0];
        setCommanderArt(first?.normal || first?.art_crop || null);
      } catch {
        setCommanderArt(null);
      }
    })();
  }, [format, commander]);

  // Extract [[Card Name]] from roast and fetch images when roast changes
  useEffect(() => {
    if (!roast?.trim()) {
      setRoastCardImages(new Map());
      return;
    }
    const names = Array.from(roast.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1].trim()).filter(Boolean);
    const uniq = Array.from(new Set(names)).slice(0, 30);
    if (uniq.length === 0) {
      setRoastCardImages(new Map());
      return;
    }
    (async () => {
      try {
        const map = await getImagesForNames(uniq);
        function norm(s: string) {
          return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
        }
        const byDisplayName = new Map<string, ImageInfo>();
        for (const name of uniq) {
          const info = map.get(norm(name));
          if (info && (info.normal || info.art_crop || info.small)) byDisplayName.set(name, info);
        }
        setRoastCardImages(byDisplayName);
      } catch {
        setRoastCardImages(new Map());
      }
    })();
  }, [roast]);

  function renderRoastWithCards(text: string, images: Map<string, ImageInfo>): React.ReactNode {
    const parts = text.split(/(\[\[[^\]]+\]\])/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[\[([^\]]+)\]\]$/);
      if (m) {
        const name = m[1].trim();
        const info = images.get(name);
        const normalUrl = info?.normal || info?.art_crop || info?.small;
        const smallUrl = info?.small || info?.normal;
        if (!normalUrl) return part;
        const trigger = (
          <span
            key={i}
            className="inline-flex items-center gap-1 align-middle cursor-help"
            onMouseEnter={(e) => handleCardHoverEnter(e, normalUrl, name)}
            onMouseLeave={() => setHoverCard(null)}
          >
            {smallUrl && (
              <img
                src={smallUrl}
                alt=""
                className="w-6 h-auto rounded border border-neutral-600 inline-block"
                aria-hidden
              />
            )}
            <span className="border-b border-dotted border-neutral-500" title={name}>
              {name}
            </span>
          </span>
        );
        return trigger;
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const hasHeader = /name|card|qty|quantity|count/i.test(lines[0] || "");
      const startIdx = hasHeader ? 1 : 0;
      let nameIdx = 0;
      let qtyIdx = 1;
      if (hasHeader) {
        const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());
        const nIdx = headers.findIndex((h) => ["name", "card", "card name"].includes(h));
        const qIdx = headers.findIndex((h) => ["qty", "quantity", "count"].includes(h));
        if (nIdx >= 0) nameIdx = nIdx;
        if (qIdx >= 0) qtyIdx = qIdx;
      }
      const deckLines: string[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        if (!cols.length) continue;
        let name = cols[nameIdx] || cols[0] || "";
        let qty = parseInt(cols[qtyIdx] ?? cols[1] ?? "1", 10);
        if (isNaN(qty)) qty = 1;
        if (!name) continue;
        deckLines.push(`${qty} ${name}`);
      }
      setDeckText(deckLines.join("\n"));
      setError(null);
    } catch {
      setError("Failed to import CSV");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function runRoast() {
    if (!deckText.trim()) {
      setError("Please paste a decklist first");
      return;
    }

    setBusy(true);
    setError(null);
    setRoast(null);
    setRoastScore(null);

    try {
      const res = await fetch("/api/deck/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckText: deckText.trim(),
          format,
          commanderName: commander.trim() || undefined,
          savageness: ROAST_LEVELS.find((l) => l.id === roastLevel)!.savageness,
        }),
      });
      const rawText = await res.text();
      let j: { ok?: boolean; roast?: string; roastScore?: number; error?: string } = {};
      try {
        j = rawText ? JSON.parse(rawText) : {};
      } catch {
        setError("Invalid response from server. Please try again.");
        return;
      }
      if (!res.ok || !j?.ok) {
        const msg = j?.error || "Roast failed";
        // Sanitize: never show raw "HTTP 200" or status codes as user-facing errors
        const friendlyMsg = /^HTTP \d{3}$/.test(msg)
          ? "Something went wrong. Please try again."
          : msg;
        throw new Error(friendlyMsg);
      }
      setRoast(j.roast || "");
      setRoastScore(typeof j.roastScore === "number" ? j.roastScore : ROAST_LEVELS.find((l) => l.id === roastLevel)!.savageness);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Roast failed");
    } finally {
      setBusy(false);
    }
  }

  const isPanel = variant === "panel";

  const collapsedHeader = (
    <div
      className={`flex flex-col items-center justify-center py-6 cursor-pointer transition-all ${
        isPanel ? "bg-gradient-to-br from-amber-950/60 via-neutral-950 to-neutral-900 border-2 border-amber-700/60 rounded-xl" : ""
      }`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <img
        src="/roast-deck-skull-icon.png"
        alt=""
        className="w-14 h-14 object-contain mb-2 opacity-90"
        aria-hidden
      />
      <h3 className="text-lg font-bold text-amber-200">Roast my Deck 🔥</h3>
      <p className="text-sm text-neutral-400 mt-1">Do you dare?</p>
    </div>
  );

  const expandedContent = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs text-neutral-400">Format:</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as any)}
          className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-200"
        >
          <option value="Commander">Commander</option>
          <option value="Modern">Modern</option>
          <option value="Pioneer">Pioneer</option>
          <option value="Standard">Standard</option>
        </select>
      </div>

      {format === "Commander" && (
        <div>
          <label className="text-xs text-neutral-400 block mb-1">First, set your commander</label>
          <div className="flex gap-3 items-start">
            {commanderArt && (
              <div className="relative shrink-0 group">
                <img
                  src={commanderArt}
                  alt={commander}
                  className="w-16 h-auto rounded border border-neutral-700 cursor-pointer hover:ring-2 hover:ring-amber-500/50 transition-shadow"
                  title="Hover for full view"
                />
                <div className="absolute left-full top-0 ml-2 z-[150] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                  <img
                    src={commanderArt}
                    alt={commander}
                    className="max-w-[280px] max-h-[400px] w-auto h-auto rounded-lg border-2 border-amber-600 shadow-2xl bg-neutral-950"
                  />
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CardAutocomplete
                value={commander}
                onChange={setCommander}
                onPick={(name) => setCommander(name)}
                placeholder="Search commander..."
                minChars={2}
                searchUrl="/api/cards/search-commanders"
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-neutral-400">Paste decklist:</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-amber-400 hover:text-amber-300"
          >
            Import CSV
          </button>
        </div>
        <textarea
          value={deckText}
          onChange={(e) => {
            setDeckText(e.target.value);
            setError(null);
          }}
          placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;..."
          className="w-full h-28 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600 resize-none"
        />
      </div>

      <div className="w-full py-2">
        <span className="text-sm text-neutral-400 block mb-2">Roast Level</span>
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={ROAST_LEVELS.findIndex((l) => l.id === roastLevel) + 1}
          onChange={(e) => setRoastLevel(ROAST_LEVELS[parseInt(e.target.value, 10) - 1].id)}
          className="w-full h-3 rounded-lg cursor-pointer accent-amber-500"
        />
        <p className="text-center text-amber-300 font-semibold mt-1">
          {ROAST_LEVELS.find((l) => l.id === roastLevel)?.emoji}{" "}
          {ROAST_LEVELS.find((l) => l.id === roastLevel)?.label}
        </p>
      </div>

      <button
        onClick={runRoast}
        disabled={busy || !deckText.trim()}
        className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        Roast me! 🔥
      </button>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      {roast && (
        <div className="space-y-3 pt-2 border-t border-neutral-800">
          {roastScore != null && (
            <div className="text-center space-y-2">
              {(() => {
                const level = getLevelFromScore(roastScore);
                return (
                  <span className="inline-block px-4 py-2 rounded-full bg-amber-900/50 border border-amber-700/60 text-amber-200 font-bold">
                    {level.emoji} {level.label} Roast Activated
                  </span>
                );
              })()}
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    const base = typeof window !== "undefined" ? window.location.origin : "https://www.manatap.ai";
                    const level = getLevelFromScore(roastScore ?? 5);
                    let permalinkUrl: string | null = null;
                    if (isLoggedIn && roast) {
                      try {
                        const r = await fetch("/api/roast/save", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            roastText: roast,
                            roastScore: roastScore ?? null,
                            commander: commander || null,
                            format,
                            roastLevel,
                            commanderArtUrl: commanderArt || null,
                          }),
                        });
                        const j = await r.json().catch(() => ({}));
                        if (j?.ok && j?.url) permalinkUrl = j.url;
                      } catch {}
                    }
                    const shareText = `My deck got roasted ${level.emoji} ${level.label} on ManaTap AI — try yours!`;
                    const url = permalinkUrl ?? `${base}${sharePath}`;
                    const full = `${shareText}\n\n${roast}\n\n${url}`;
                    await navigator.clipboard.writeText(full);
                    try { const t = await import("@/lib/toast-client"); t.toast("Copied to clipboard!", "success"); } catch {}
                  }}
                  className="px-3 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium text-sm transition-colors"
                >
                  Copy Roast
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const base = window.location.origin;
                    const level = getLevelFromScore(roastScore ?? 5);
                    let url = `${base}${sharePath}`;
                    if (isLoggedIn && roast) {
                      try {
                        const r = await fetch("/api/roast/save", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            roastText: roast,
                            roastScore: roastScore ?? null,
                            commander: commander || null,
                            format,
                            roastLevel,
                            commanderArtUrl: commanderArt || null,
                          }),
                        });
                        const j = await r.json().catch(() => ({}));
                        if (j?.ok && j?.url) url = j.url;
                      } catch {}
                    }
                    if (typeof navigator !== "undefined" && navigator.share) {
                      await navigator.share({
                        title: "Deck Roast | ManaTap AI",
                        text: `My deck got roasted ${level.emoji} ${level.label} on ManaTap AI!`,
                        url,
                      });
                      try { const t = await import("@/lib/toast-client"); t.toast("Shared!", "success"); } catch {}
                    } else {
                      const text = encodeURIComponent(`My deck got roasted ${level.emoji} ${level.label} on ManaTap AI — try yours!`);
                      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, "_blank");
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const base = typeof window !== "undefined" ? window.location.origin : "https://www.manatap.ai";
                    let url = `${base}${sharePath}`;
                    if (isLoggedIn && roast) {
                      try {
                        const r = await fetch("/api/roast/save", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            roastText: roast,
                            roastScore: roastScore ?? null,
                            commander: commander || null,
                            format,
                            roastLevel,
                            commanderArtUrl: commanderArt || null,
                          }),
                        });
                        const j = await r.json().catch(() => ({}));
                        if (j?.ok && j?.url) url = j.url;
                      } catch {}
                    }
                    const text = encodeURIComponent("Just got my deck roasted 🔥 on ManaTap AI — try yours!");
                    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, "_blank");
                  }}
                  className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-600 text-white font-medium text-sm transition-colors"
                >
                  Share on X
                </button>
              </div>
            </div>
          )}
          {format === "Commander" && commanderArt && (
            <div
              className="flex justify-center"
              onMouseEnter={(e) => handleCardHoverEnter(e, commanderArt, commander)}
              onMouseLeave={() => setHoverCard(null)}
            >
              <img
                src={commanderArt}
                alt={commander}
                className="w-48 h-auto rounded-lg border border-neutral-700 shadow-lg cursor-pointer hover:ring-2 hover:ring-amber-500/50 transition-shadow"
                title="Hover for full view"
              />
            </div>
          )}
          <div className="text-sm text-neutral-200 whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
            {renderRoastWithCards(roast, roastCardImages)}
          </div>
          {showSignupCta && (
            <div className="pt-4 mt-4 border-t border-neutral-700 space-y-4">
              <p className="text-sm text-neutral-400 italic text-center">
                Roasts are free. Fixing the deck is where the real work begins.
              </p>
              <p className="text-sm font-medium text-neutral-200 text-center">
                Want the serious analysis behind the roast?
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Link
                  href="/auth/signup"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-center transition-colors"
                >
                  Create Account
                </Link>
                <Link
                  href="/my-decks"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-lg border border-neutral-600 hover:border-amber-600/60 hover:bg-amber-950/30 text-neutral-200 font-medium text-center transition-colors"
                >
                  Learn More
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const triggerButton = (
    <button
      type="button"
      onClick={() => useModal ? setModalOpen(true) : setIsExpanded(!isExpanded)}
      className={`w-full flex flex-col items-center justify-center py-4 cursor-pointer transition-all ${
        isPanel ? "bg-gradient-to-br from-amber-950/60 via-neutral-950 to-neutral-900 border-2 border-amber-700/60 rounded-xl hover:border-amber-600/80" : ""
      }`}
    >
      <img
        src="/roast-deck-skull-icon.png"
        alt=""
        className="w-14 h-14 object-contain mb-2 opacity-90"
        aria-hidden
      />
      <h3 className="text-lg font-bold text-amber-200">Roast my Deck 🔥</h3>
      <p className="text-sm text-neutral-400 mt-1">Do you dare?</p>
    </button>
  );

  if (useModal) {
    return (
      <div className="w-full">
        {triggerButton}
        {typeof document !== "undefined" &&
          modalOpen &&
          createPortal(
            <div
              className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70"
              onClick={() => setModalOpen(false)}
            >
              <div
                className="bg-neutral-950 border border-neutral-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-neutral-950 border-b border-neutral-800 p-4 grid grid-cols-[1fr_auto_1fr] items-center">
                  <div />
                  <h3 className="text-center text-lg font-bold text-amber-200">Roast my Deck 🔥</h3>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="justify-self-end text-neutral-400 hover:text-white p-1"
                    aria-label="Close"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4">{expandedContent}</div>
              </div>
            </div>,
            document.body
          )}
      </div>
    );
  }

  return (
    <div className="w-full">
      {typeof document !== "undefined" &&
        hoverCard &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{ left: hoverCard.x, top: hoverCard.y }}
          >
            <img
              src={hoverCard.src}
              alt={hoverCard.name}
              className={`w-auto h-auto rounded-lg border-2 border-amber-600 shadow-2xl bg-neutral-950 ${HOVER_CARD_SIZE}`}
            />
          </div>,
          document.body
        )}
      <ComputingModal
        isOpen={busy}
        title="Roasting your deck..."
        indeterminate
        indeterminateLabel="Generating your roast..."
      />
      {isPanel ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
          <div
            className={`p-4 ${!isExpanded ? "border-b-0" : "border-b border-neutral-800"}`}
            onClick={() => !isExpanded && setIsExpanded(true)}
          >
            {!isExpanded ? (
              collapsedHeader
            ) : (
              <div className="flex flex-col gap-1 mb-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-amber-200">Roast my Deck 🔥</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                  className="text-neutral-400 hover:text-white"
                  aria-label="Collapse"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                </div>
                <p className="text-sm text-amber-400/90">
                  Roast Level: {ROAST_LEVELS.find((l) => l.id === roastLevel)?.emoji}{" "}
                  {ROAST_LEVELS.find((l) => l.id === roastLevel)?.label}
                </p>
              </div>
            )}
          </div>
          {isExpanded && <div className="p-4 pt-0">{expandedContent}</div>}
        </div>
      ) : (
        <div className="space-y-2">
          {!isExpanded ? (
            <div onClick={() => setIsExpanded(true)}>{collapsedHeader}</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-200">Roast my Deck 🔥</span>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-neutral-400 hover:text-white text-xs"
                >
                  Collapse
                </button>
              </div>
              {expandedContent}
            </>
          )}
        </div>
      )}
    </div>
  );
}
