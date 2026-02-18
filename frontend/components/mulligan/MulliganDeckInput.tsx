"use client";

import React, { useState, useEffect, useCallback } from "react";
import { parseDecklist } from "@/lib/mulligan/parse-decklist";
import { SAMPLE_DECKS } from "@/lib/sample-decks";
import { useAuth } from "@/lib/auth-context";
import HandTestingWidget from "./HandTestingWidget";

const FIRST_SAMPLE = SAMPLE_DECKS[0];
type DeckRow = { id: string; title?: string | null };

export default function MulliganDeckInput() {
  const { user, loading: authLoading } = useAuth();
  const [deckSource, setDeckSource] = useState<"example" | "paste" | "load">("example");
  const [deckText, setDeckText] = useState("");
  const [deckId, setDeckId] = useState("");
  const [deckCards, setDeckCards] = useState<Array<{ name: string; qty: number }>>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [commander, setCommander] = useState<string | null>(null);

  // Resolve deck for widget
  useEffect(() => {
    if (deckSource === "example" && FIRST_SAMPLE) {
      const cards = parseDecklist(FIRST_SAMPLE.deckList).map((p) => ({
        name: p.name,
        qty: p.count,
      }));
      setDeckCards(cards);
      setCommander(FIRST_SAMPLE.commander);
      setDeckId("");
      return;
    }
    if (deckSource === "paste" && deckText.trim()) {
      const cards = parseDecklist(deckText).map((p) => ({ name: p.name, qty: p.count }));
      setDeckCards(cards);
      setCommander(null);
      setDeckId("");
      return;
    }
    if (deckSource === "load" && deckId) {
      setDeckCards([]);
      setDeckId(deckId);
      return;
    }
    if (deckSource === "load" && !deckId) {
      setDeckCards([]);
      return;
    }
    if (deckSource === "paste" && !deckText.trim()) {
      setDeckCards([]);
    }
  }, [deckSource, deckText, deckId]);

  useEffect(() => {
    if (!user) {
      setDecks([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/decks/my", { cache: "no-store" });
        const j = await res.json().catch(() => ({ ok: false }));
        if (res.ok && j?.ok && Array.isArray(j.decks)) setDecks(j.decks);
      } catch {}
    })();
  }, [user]);

  const handleLoadDeck = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.cards)) return;
      const cards = (data.cards as { name: string; qty: number }[]).map((c) => ({
        name: c.name,
        qty: c.qty || 1,
      }));
      setDeckCards(cards);
      const metaRes = await fetch(`/api/decks/get?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const meta = await metaRes.json().catch(() => ({}));
      const cmd = (meta?.deck as { commander?: string })?.commander;
      setCommander(cmd ? String(cmd).trim() || null : null);
    } catch {}
  }, []);

  useEffect(() => {
    if (deckSource === "load" && deckId) handleLoadDeck(deckId);
  }, [deckSource, deckId, handleLoadDeck]);

  const mode = deckSource === "example" ? "DEMO" : "DECK";
  const hasDeck = mode === "DEMO" || deckCards.length > 0 || deckId;

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setDeckSource("example")}
          className={`px-2 py-1.5 rounded text-xs ${
            deckSource === "example" ? "bg-amber-600 text-black" : "bg-neutral-700 text-neutral-300"
          }`}
        >
          Example deck
        </button>
        <button
          onClick={() => setDeckSource("paste")}
          className={`px-2 py-1.5 rounded text-xs ${
            deckSource === "paste" ? "bg-amber-600 text-black" : "bg-neutral-700 text-neutral-300"
          }`}
        >
          Paste
        </button>
        <button
          onClick={() => setDeckSource("load")}
          className={`px-2 py-1.5 rounded text-xs ${
            deckSource === "load" ? "bg-amber-600 text-black" : "bg-neutral-700 text-neutral-300"
          }`}
        >
          Load deck
        </button>
      </div>
      {deckSource === "paste" && (
        <div className="space-y-1">
          <textarea
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder="1 Sol Ring&#10;1 Arcane Signet&#10;..."
            className="w-full h-20 bg-neutral-950 border border-neutral-600 rounded px-2 py-1.5 text-xs font-mono resize-none"
          />
        </div>
      )}
      {deckSource === "load" && !user && !authLoading && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "signup" } }))}
          className="w-full rounded-lg border-2 border-dashed border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500/80 transition-all py-4 px-4 flex flex-col items-center gap-2 group"
        >
          <span className="text-amber-400 font-semibold text-sm">Sign in to load your decks</span>
          <span className="text-neutral-400 text-xs">Save decks and test opening hands anytime</span>
          <span className="text-amber-500 text-xs font-medium group-hover:text-amber-400">Sign up free →</span>
        </button>
      )}
      {deckSource === "load" && (user || authLoading) && (
        <select
          value={deckId}
          onChange={(e) => setDeckId(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-600 rounded px-2 py-1.5 text-xs"
        >
          <option value="">{authLoading ? "Loading…" : decks.length === 0 ? "No decks yet" : "Select deck…"}</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title || "Untitled"}
            </option>
          ))}
        </select>
      )}
      {hasDeck && (
        <div className="text-[10px] text-neutral-500">
          {deckSource === "example"
            ? `Using: ${FIRST_SAMPLE?.name ?? "Example"} (${FIRST_SAMPLE?.commander ?? ""})`
            : deckSource === "load" && deckId
              ? decks.find((d) => d.id === deckId)?.title ?? "Loaded"
              : deckSource === "paste"
                ? "Pasted deck"
                : ""}
        </div>
      )}
      <HandTestingWidget
        mode={mode}
        deckId={deckId || undefined}
        decklistText={deckSource === "paste" ? deckText : undefined}
        deckCards={deckCards.length > 0 ? deckCards : undefined}
        commanderName={commander}
        compact={true}
        placement="HOME"
        className="w-full border-0 rounded-none bg-transparent p-0"
      />
    </div>
  );
}
