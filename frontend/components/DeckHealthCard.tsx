"use client";
import React from "react";

function sanitizeLLM(input: string): string {
  // Strip all tags; allow only basic line breaks.
  try {
    const withoutTags = input.replace(/<[^>]*>/g, '');
    return withoutTags;
  } catch {
    return input;
  }
}

type Bands = { curve: number; ramp: number; draw: number; removal: number; mana: number };
type Result = {
  score: number;
  note?: string;
  bands: Bands;
  curveBuckets: number[];
  whatsGood?: string[];
  quickFixes?: string[];
  illegalByCI?: number;
  illegalExamples?: string[];
};

export default function DeckHealthCard({
  result,
  onSave,
  onMyDecks,
}: {
  result: Result;
  onSave?: () => void;
  onMyDecks?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-700 bg-slate-900 text-slate-200 shadow-md w-[640px] max-w-[90vw]">
      <div className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-amber-700/40 to-amber-600/20 rounded-t-2xl">
        Deck Health: {result.score}/100 — {result.note || "snapshot"}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-5 gap-2 items-end text-[11px]">
          {(["curve","ramp","draw","removal","mana"] as const).map((k) => (
            <div key={k}>
              <div className="mb-1 capitalize">{k}</div>
              <div className="h-2 bg-slate-800 rounded">
                <div className="h-2 rounded bg-amber-500" style={{ width: `${Math.round((result.bands as any)[k]*100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="font-semibold text-sm mb-1">What’s good</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {(result.whatsGood ?? []).map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-sm mb-1">Quick fixes</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {(result.quickFixes ?? []).map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: t }} />)}
            </ul>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            className="px-3 py-1.5 rounded bg-amber-600 text-black font-semibold hover:bg-amber-500 disabled:opacity-50"
            onClick={() => onSave?.()}
            disabled={!onSave}
          >
            Save deck
          </button>
          <button
            className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600"
            onClick={() => onMyDecks?.()}
            disabled={!onMyDecks}
          >
            My Decks →
          </button>
        </div>
      </div>
    </div>
  );
}
