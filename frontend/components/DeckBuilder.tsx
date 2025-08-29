"use client";
import { useState } from "react";
import DeckHealthCard from "./DeckHealthCard";
import { usePrefs } from "./PrefsContext";

type AnalyzeResponse = {
  score: number;
  note: string;
  bands: { curve: number; ramp: number; draw: number; removal: number; mana: number };
  whatsGood: string[];
  quickFixes: string[];
};

export default function DeckBuilder() {
  const { format, plan, colors, currency } = usePrefs();

  const [deckText, setDeckText] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setError(null);
    setLoading(true);
    setData(null);
    try {
      const res = await fetch("/api/deck/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckText,
          format,
          plan,
          colors,
          currency,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AnalyzeResponse = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Deck Builder (MVP)</h2>
        <div className="text-xs text-gray-400">
          Using: {format} · {plan} · {colors.length ? colors.join("") : "Any colors"} · {currency}
        </div>
      </div>

      <textarea
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
        placeholder="Paste a decklist (one card per line, e.g. '4 Island' or 'Sol Ring')…"
        className="w-full min-h-[120px] rounded-lg bg-gray-950 border border-gray-800 p-3 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={analyze}
          disabled={loading || deckText.trim().length === 0}
          className="px-4 py-2 rounded-lg bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : "Analyze deck"}
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>

      {data && (
        <div className="mt-4">
          <DeckHealthCard
            score={data.score}
            note={data.note}
            bands={data.bands}
            whatsGood={data.whatsGood}
            quickFixes={data.quickFixes}
          />
        </div>
      )}
    </div>
  );
}
