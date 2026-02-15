"use client";

import React from "react";
import { useRouter } from "next/navigation";

type Props = {
  commanderSlug: string;
  commanderName: string;
};

export function CostLandingCalculator({ commanderSlug, commanderName }: Props) {
  const router = useRouter();
  const [deckText, setDeckText] = React.useState("");

  const handleCalculate = () => {
    if (typeof window !== "undefined" && deckText.trim()) {
      try {
        sessionStorage.setItem("cost-to-finish-paste", deckText.trim());
      } catch {}
    }
    router.push(`/collections/cost-to-finish?commander=${encodeURIComponent(commanderSlug)}`);
  };

  return (
    <section className="rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-5 mb-6">
      <h2 className="text-lg font-semibold text-white mb-3">
        Calculate your {commanderName} deck cost
      </h2>
      <p className="text-sm text-neutral-400 mb-3">
        Paste your decklist below, then click Calculate to see the total cost and breakdown.
      </p>
      <textarea
        placeholder="1 Sol Ring&#10;1 Command Tower&#10;..."
        value={deckText}
        onChange={(e) => setDeckText(e.target.value)}
        className="w-full h-32 rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-2 font-mono text-sm text-neutral-200 placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
        rows={6}
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleCalculate}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm"
        >
          Calculate cost →
        </button>
        <a
          href={`/collections/cost-to-finish?commander=${encodeURIComponent(commanderSlug)}`}
          className="px-4 py-2 rounded-lg border border-neutral-600 hover:border-cyan-500 text-neutral-300 hover:text-white text-sm"
        >
          Open tool without pasting
        </a>
      </div>
    </section>
  );
}
