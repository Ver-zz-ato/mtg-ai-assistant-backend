"use client";

import React, { useState, useRef, useEffect } from "react";
import CardAutocomplete from "@/components/CardAutocomplete";
import ComputingModal from "@/components/ComputingModal";
import { getImagesForNames } from "@/lib/scryfall-cache";
import Link from "next/link";

const ROAST_STAGES = [
  { icon: "👀", label: "Reading your decklist..." },
  { icon: "🔥", label: "Preparing the roast..." },
  { icon: "⚡", label: "Generating feedback..." },
  { icon: "✨", label: "Almost done..." },
];

export interface DeckRoastPanelProps {
  variant?: "panel" | "inline";
  showSignupCta?: boolean;
}

export default function DeckRoastPanel({
  variant = "panel",
  showSignupCta = true,
}: DeckRoastPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [deckText, setDeckText] = useState("");
  const [format, setFormat] = useState<"Commander" | "Modern" | "Pioneer" | "Standard">("Commander");
  const [commander, setCommander] = useState("");
  const [keepFriendly, setKeepFriendly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roast, setRoast] = useState<string | null>(null);
  const [commanderArt, setCommanderArt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      const res = await fetch("/api/deck/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckText: deckText.trim(),
          format,
          commanderName: commander.trim() || undefined,
          keepFriendly,
        }),
      });
      const rawText = await res.text();
      let j: { ok?: boolean; roast?: string; error?: string } = {};
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
              <img
                src={commanderArt}
                alt={commander}
                className="w-16 h-auto rounded border border-neutral-700 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <CardAutocomplete
                value={commander}
                onChange={setCommander}
                onPick={(name) => setCommander(name)}
                placeholder="Search commander..."
                minChars={2}
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

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="keep-friendly"
          checked={keepFriendly}
          onChange={(e) => setKeepFriendly(e.target.checked)}
          className="rounded border-neutral-600 bg-neutral-800 text-amber-500 focus:ring-amber-500"
        />
        <label htmlFor="keep-friendly" className="text-sm text-neutral-300 cursor-help flex items-center gap-1">
          Keep it friendly
          <span
            title="On: softer, encouraging tone with fewer zingers. Off: more sarcastic and brutally honest—your brutally honest LGS friend."
            className="text-neutral-500 hover:text-neutral-400"
          >
            (?)
          </span>
        </label>
      </div>

      <button
        onClick={runRoast}
        disabled={busy || !deckText.trim()}
        className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        Roast me!
      </button>

      {error && (
        <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      {roast && (
        <div className="space-y-3 pt-2 border-t border-neutral-800">
          {format === "Commander" && commanderArt && (
            <div className="flex justify-center">
              <img
                src={commanderArt}
                alt={commander}
                className="w-48 h-auto rounded-lg border border-neutral-700 shadow-lg"
              />
            </div>
          )}
          <div className="text-sm text-neutral-200 whitespace-pre-wrap prose prose-invert prose-sm max-w-none">
            {roast}
          </div>
          {showSignupCta && (
            <div className="text-xs text-neutral-400 text-center pt-2 border-t border-neutral-800">
              More advanced analysis?{" "}
              <Link href="/auth/signup" className="text-amber-400 hover:text-amber-300">
                Make an account
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full">
      <ComputingModal
        isOpen={busy}
        title="Roasting your deck..."
        stages={ROAST_STAGES}
        cycleInterval={600}
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
              <div className="flex items-center justify-between mb-3">
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
