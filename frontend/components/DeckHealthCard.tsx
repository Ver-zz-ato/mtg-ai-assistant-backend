"use client";
import React from "react";
import { sanitizeHTML } from "@/lib/sanitize";

function sanitizeLLM(input: string): string {
  // Use DOMPurify for proper HTML sanitization (allows safe HTML, removes scripts)
  return sanitizeHTML(input);
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
  bannedCount?: number;
  bannedExamples?: string[];
  tokenNeeds?: string[];
  combosPresent?: Array<{ name: string; pieces: string[] }>;
  combosMissing?: Array<{ name: string; have: string[]; missing: string[]; suggest: string }>;
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
    <div className="rounded-2xl border border-amber-700 bg-slate-900 text-slate-200 shadow-md w-full sm:w-[640px] max-w-full">
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

        {(result.bannedCount || result.illegalByCI) ? (
          <div className="text-xs text-red-300">{result.bannedCount ? (`Banned in format: ${result.bannedExamples?.join(', ')}`) : null}{result.bannedCount && result.illegalByCI ? ' • ' : ''}{result.illegalByCI ? (`Color identity conflicts: ${result.illegalExamples?.join(', ')}`) : null}</div>
        ) : null}

        {(Array.isArray(result.tokenNeeds) && result.tokenNeeds.length > 0) ? (
          <div className="text-xs text-neutral-300">Tokens created: <span className="opacity-80">{result.tokenNeeds.join(', ')}</span></div>
        ) : null}

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="font-semibold text-sm mb-1">What’s good</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {(result.whatsGood ?? []).map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: sanitizeHTML(t) }} />)}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-sm mb-1">Quick fixes</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {(result.quickFixes ?? []).map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: sanitizeHTML(t) }} />)}
            </ul>
          </div>
        </div>

        {(Array.isArray(result.combosPresent) && result.combosPresent.length > 0) || (Array.isArray(result.combosMissing) && result.combosMissing.length > 0) ? (
          <div className="mt-2">
            <div className="font-semibold text-sm mb-1">Combos</div>
            {Array.isArray(result.combosPresent) && result.combosPresent.length > 0 && (
              <div className="text-sm mb-1">
                <div className="opacity-80 text-[12px]">Present:</div>
                <ul className="list-disc pl-5 space-y-1">
                  {result.combosPresent.slice(0,5).map((c,i)=> (
                    <li key={'cp'+i}>
                      <span className="font-medium">{c.name}</span>
                      {Array.isArray(c.pieces) && c.pieces.length>0 && <span className="opacity-80"> — {c.pieces.join(' + ')}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(result.combosMissing) && result.combosMissing.length > 0 && (
              <div className="text-sm">
                <div className="opacity-80 text-[12px]">One piece missing:</div>
                <ul className="list-disc pl-5 space-y-1">
                  {result.combosMissing.slice(0,5).map((c,i)=> (
                    <li key={'cm'+i}>
                      <span className="font-medium">{c.name}</span>
                      {Array.isArray(c.have) && c.have.length>0 && (
                        <span className="opacity-80"> — have {c.have.join(' + ')}, need {c.suggest}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

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
