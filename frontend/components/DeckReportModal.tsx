"use client";

import React from "react";
import Modal from "@/components/Modal";
import DeckHealthCard from "@/components/DeckHealthCard";

export type DeckAnalysisApiResult = {
  score: number;
  note?: string;
  bands: { curve: number; ramp: number; draw: number; removal: number; mana: number };
  curveBuckets?: number[];
  whatsGood?: string[];
  quickFixes?: string[];
  bannedExamples?: string[];
  illegalExamples?: string[];
  tokenNeeds?: string[];
  combosPresent?: Array<{ name: string; pieces: string[] }>;
  combosMissing?: Array<{ name: string; have: string[]; missing: string[]; suggest: string }>;
};

export default function DeckReportModal({
  open,
  onClose,
  result,
}: {
  open: boolean;
  onClose: () => void;
  result: DeckAnalysisApiResult | null;
}) {
  if (!open) return null;

  const mappedResult = result
    ? {
        score: result.score,
        note: result.note ?? "snapshot",
        bands: result.bands ?? { curve: 0, ramp: 0, draw: 0, removal: 0, mana: 0 },
        curveBuckets: result.curveBuckets ?? [],
        whatsGood: result.whatsGood ?? [],
        quickFixes: result.quickFixes ?? [],
        illegalByCI: result.illegalExamples?.length ?? 0,
        illegalExamples: result.illegalExamples ?? [],
        bannedCount: result.bannedExamples?.length ?? 0,
        bannedExamples: result.bannedExamples ?? [],
        tokenNeeds: result.tokenNeeds ?? [],
        combosPresent: result.combosPresent ?? [],
        combosMissing: result.combosMissing ?? [],
      }
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-report-title"
      >
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-700 bg-neutral-900/95 px-4 py-3 backdrop-blur-sm">
          <h2 id="deck-report-title" className="text-base font-semibold text-neutral-200">
            Deck Report Card
          </h2>
          <button
            onClick={onClose}
            className="rounded p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          {mappedResult ? (
            <DeckHealthCard
              result={mappedResult}
              onMyDecks={() => {
                onClose();
                window.location.href = "/my-decks";
              }}
            />
          ) : (
            <div className="py-8 text-center text-neutral-400">No report data available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
