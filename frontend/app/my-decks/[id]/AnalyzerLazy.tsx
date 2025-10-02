'use client';
import React from 'react';
import NextDynamic from 'next/dynamic';

const Analyzer = NextDynamic(() => import('./DeckAnalyzerPanel'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-neutral-800 p-3 text-xs opacity-70">Loading analyzer…</div>
  ),
});

export default function AnalyzerLazy({ deckId, proAuto }: { deckId: string; proAuto: boolean }) {
  return <Analyzer deckId={deckId} proAuto={proAuto} />;
}