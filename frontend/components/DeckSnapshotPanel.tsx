"use client";
import React, { useCallback, useEffect, useState } from "react";
import DeckHealthCard from "@/components/DeckHealthCard";
import { capture } from "@/lib/analytics"

type AnalyzeResult = {
  score: number;
  note?: string;
  bands: { curve: number; ramp: number; draw: number; removal: number; mana: number };
  curveBuckets: number[];
  whatsGood?: string[];
  quickFixes?: string[];
  illegalByCI?: number;
  illegalExamples?: string[];
};

type Props = {
  format: string;
  plan: string;
  colors: string[];
  currency: string;
};

export default function DeckSnapshotPanel({ format, plan, colors, currency }: Props) {
  const [deckText, setDeckText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const analyzeWithText = useCallback(async (text: string) => {
    if (!text?.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deckText: text,
          format, plan, colors, currency,
          useScryfall: true,
        }),
      });
      const body = await res.text();
      let json: any = null;
      try { json = JSON.parse(body); } catch { json = null; }
      if (!res.ok || json?.ok === false) throw new Error(json?.error?.message || "Analyze failed");
      setResult(json?.result ?? json);
    } catch (e: any) {
      setError(e?.message ?? "Analyze failed");
    } finally {
      setLoading(false);
    }
  }, [format, plan, colors, currency]);

  async function analyze() {
    await analyzeWithText(deckText);
  }

  async function saveDeck() {
    try {
      const res = await fetch("/api/decks/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Imported Deck",
          format, plan, colors, currency,
          deck_text: deckText,
          data: { analyze: result },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error?.message || "Save failed");
      capture('deck_created');
      console.debug('[analytics] deck_created');
      try { capture('deck_created', { deck_id: (json?.id ?? null), format }); } catch {}
      alert("Saved! Check My Decks.");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    }
  }

  function gotoMyDecks() {
    window.location.href = "/my-decks";
  }

  useEffect(() => {
    function onAnalyzeEvent(ev: any) {
      const text = ev?.detail?.deckText ?? ev?.detail ?? "";
      if (typeof text === "string" && text.trim()) {
        setDeckText(text);
        analyzeWithText(text);
      }
    }
    window.addEventListener("mtg:analyze", onAnalyzeEvent as any);
    return () => window.removeEventListener("mtg:analyze", onAnalyzeEvent as any);
  }, [analyzeWithText]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-neutral-900 text-slate-200 border border-neutral-700 p-3">
        <div className="text-sm mb-2">Paste a deck into chat or here to get score, curve, color identity & quick fixes.</div>
        <textarea
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
          placeholder="1 Sol Ring\n1 Arcane Signet\n..."
          className="w-full h-40 resize-y bg-neutral-950 border border-neutral-700 rounded p-2"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={analyze} disabled={loading || !deckText.trim()} className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-black font-medium">
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
        {error && <div className="text-red-300 text-sm mt-2">Error: {error}</div>}
      </div>

      {result && (
        <DeckHealthCard
          result={result}
          onSave={saveDeck}
          onMyDecks={gotoMyDecks}
        />
      )}
    </div>
  );
}
