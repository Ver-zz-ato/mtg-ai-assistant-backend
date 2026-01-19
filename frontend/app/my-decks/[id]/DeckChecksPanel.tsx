"use client";
import React from "react";
import NextDynamic from 'next/dynamic';

const Analyzer = NextDynamic(() => import('./DeckAnalyzerPanel'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-neutral-800 p-3 text-xs opacity-70">Loading analyzer…</div>
  ),
});

const LegalityTokensPanel = NextDynamic(() => import('./LegalityTokensPanel'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-neutral-800 p-3 text-xs opacity-70">Loading legality checker…</div>
  ),
});

export default function DeckChecksPanel({ 
  deckId, 
  isPro, 
  format 
}: { 
  deckId: string; 
  isPro: boolean; 
  format?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [showAnalyzer, setShowAnalyzer] = React.useState(false);
  const [showLegality, setShowLegality] = React.useState(false);
  
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        if (shouldShow !== undefined) {
          setOpen(Boolean(shouldShow));
        }
      }
    };
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    return () => window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
  }, []);

  function runAllChecks() {
    // Expand both sections so users can run checks
    setOpen(true);
    setShowAnalyzer(true);
    setShowLegality(true);
  }

  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50"></div>
          <h3 className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-teal-500 bg-clip-text text-transparent">
            Deck Checks
          </h3>
        </div>
        <button 
          onClick={() => setOpen(v => !v)} 
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <div className="space-y-4">
          {/* Run All Checks Button - Expands both sections */}
          <button
            onClick={runAllChecks}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-md hover:shadow-lg"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run all checks
            </span>
          </button>

          {/* Analyzer Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowAnalyzer(v => !v)}
                className="text-xs font-medium text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <span>{showAnalyzer ? '▼' : '▶'}</span>
                Deck Analyzer
              </button>
            </div>
            {showAnalyzer && (
              <div className="border border-neutral-700 rounded-lg p-2">
                <Analyzer deckId={deckId} proAuto={!!isPro} format={format} />
              </div>
            )}
          </div>

          {/* Legality & Tokens Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowLegality(v => !v)}
                className="text-xs font-medium text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <span>{showLegality ? '▼' : '▶'}</span>
                Legality & Tokens
              </button>
            </div>
            {showLegality && (
              <div className="border border-neutral-700 rounded-lg p-2">
                <LegalityTokensPanel deckId={deckId} format={format} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
