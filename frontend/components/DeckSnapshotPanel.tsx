"use client";
import React, { useCallback, useEffect, useState } from "react";
import DeckHealthCard from "@/components/DeckHealthCard";
import PublicTrustFooter from "@/components/PublicTrustFooter";
import { capture } from "@/lib/analytics"
import { trackDeckCreationWorkflow } from '@/lib/analytics-workflow';
import { trackApiCall, trackError } from '@/lib/analytics-performance';

type AnalyzeResult = {
  score: number;
  note?: string;
  bands: { curve: number; ramp: number; draw: number; removal: number; mana: number };
  curveBuckets: number[];
  whatsGood?: string[];
  quickFixes?: string[];
  illegalByCI?: number;
  illegalExamples?: string[];
  metaHints?: Array<{ card: string; inclusion_rate: string; commanders: string[] }>;
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
    
    await trackApiCall("/analyze", "deck_analysis", async () => {
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
      
      // Track successful analysis
      capture('deck_analyzed', {
        format,
        plan,
        colors: colors.join(','),
        score: json?.result?.score || json?.score,
        card_count: text.split('\n').filter(Boolean).length,
        prompt_version: json?.prompt_version || json?.prompt_version_id || null,
        // deck_id: not available in this component (standalone analysis)
        // commander: would need to extract from deckText or pass as prop
      });
      
      return json;
    }).catch((e: any) => {
      setError(e?.message ?? "Analyze failed");
      throw e;
    }).finally(() => {
      setLoading(false);
    });
  }, [format, plan, colors, currency]);

  async function analyze() {
    await analyzeWithText(deckText);
  }

  async function saveDeck() {
    trackDeckCreationWorkflow('started', { source: 'analysis_panel' });
    
    try {
      const res = await trackApiCall('/api/decks/create', 'deck_creation', async () => {
        return fetch("/api/decks/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Imported Deck",
            format, plan, colors, currency,
            deck_text: deckText,
            data: { analyze: result },
          }),
        });
      });
      
      const json = await res.json();
      if (!res.ok || json?.ok === false) throw new Error(json?.error?.message || "Save failed");
      
      // Enhanced deck creation tracking
      trackDeckCreationWorkflow('saved', { 
        deck_id: json?.id, 
        source: 'analysis_panel',
        has_analysis: !!result,
        analysis_score: result?.score
      });
      
      capture('deck_created', { 
        deck_id: (json?.id ?? null), 
        format,
        source: 'analysis_panel',
        analysis_score: result?.score
      });
      
      alert("Saved! Check My Decks.");
    } catch (e: any) {
      trackDeckCreationWorkflow('abandoned', { 
        current_step: 2, 
        abandon_reason: 'save_failed',
        error_message: e?.message 
      });
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
        <>
          <DeckHealthCard
            result={result}
            onSave={saveDeck}
            onMyDecks={gotoMyDecks}
          />
          {(result.metaHints && result.metaHints.length > 0) && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
              <div className="text-sm font-medium mb-2">Meta hints</div>
              <div className="flex flex-wrap gap-2">
                {result.metaHints.slice(0, 8).map((m, i) => (
                  <span key={`${m.card}-${i}`} title={`Seen in ${m.commanders.join(', ')}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-neutral-800">
                    <span className="text-neutral-200">{m.card}</span>
                    <span className="opacity-70">{m.inclusion_rate}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Trust footer */}
      <div className="pt-2">
        <PublicTrustFooter compact={true} className="justify-center" />
      </div>
    </div>
  );
}
