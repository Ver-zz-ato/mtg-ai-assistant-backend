"use client";
import React, { useCallback, useEffect, useState } from "react";
import DeckHealthCard from "@/components/DeckHealthCard";
import PublicTrustFooter from "@/components/PublicTrustFooter";
import { capture } from "@/lib/ph";
import { trackDeckCreationWorkflow } from '@/lib/analytics-workflow';
import { setActiveWorkflow, clearActiveWorkflow, getCurrentWorkflowRunId } from '@/lib/analytics/workflow-abandon';
import { trackApiCall, trackError } from '@/lib/analytics-performance';
import { trackProGateViewed, trackProGateClicked, trackProUpgradeStarted } from '@/lib/analytics-pro';
import { useProStatus } from '@/hooks/useProStatus';

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
  const { isPro } = useProStatus();
  const [deckText, setDeckText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  
  // Track PRO gate view for export feature (workflow pro gate)
  useEffect(() => {
    if (result && !isPro) {
      trackProGateViewed('export_deck_analysis', 'analysis_workflow', {
        plan_suggested: 'monthly',
        reason: 'feature_required',
      });
    }
  }, [result, isPro]);

  const analyzeWithText = useCallback(async (text: string) => {
    if (!text?.trim()) return;
    setLoading(true);
    setError(null);
    const runId = setActiveWorkflow('deck_analyze');
    capture('deck_analyze_started', {
      format,
      plan,
      colors: colors.join(','),
      card_count: text.split('\n').filter(Boolean).length,
      workflow_run_id: runId,
    });

    try {
      await trackApiCall("/analyze", "deck_analysis", async () => {
        const res = await fetch("/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deckText: text,
            format,
            plan,
            colors,
            currency,
            useScryfall: true,
          }),
        });
        const body = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(body);
        } catch {
          json = null;
        }
        if (!res.ok || json?.ok === false) throw new Error(json?.error?.message || "Analyze failed");
        setResult(json?.result ?? json);

        const runIdDone = getCurrentWorkflowRunId();
        clearActiveWorkflow();
        capture('deck_analyzed', {
          workflow_run_id: runIdDone ?? undefined,
          format,
          plan,
          colors: colors.join(','),
          score: json?.result?.score || json?.score,
          card_count: text.split('\n').filter(Boolean).length,
          prompt_version: json?.prompt_version || json?.prompt_version_id || null,
        });
        try {
          const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
          const sb = createBrowserSupabaseClient();
          const { data: { user } } = await sb.auth.getUser();
          if (!user) {
            const { capture: captureEvent } = await import('@/lib/ph');
            const { AnalyticsEvents } = await import('@/lib/analytics/events');
            captureEvent(AnalyticsEvents.GUEST_VALUE_MOMENT, {
              value_moment_type: 'deck_analyzed',
              score: json?.result?.score || json?.score,
              card_count: text.split('\n').filter(Boolean).length,
            }, { isAuthenticated: false });
          }
        } catch {}
        return json;
      });
    } catch (e: any) {
      clearActiveWorkflow();
      setError(e?.message ?? "Analyze failed");
      throw e;
    } finally {
      setLoading(false);
    }
  }, [format, plan, colors, currency]);

  async function analyze() {
    await analyzeWithText(deckText);
  }

  async function saveDeck() {
    const runId = setActiveWorkflow('deck_create');
    trackDeckCreationWorkflow('started', { source: 'analysis_panel', workflow_run_id: runId });

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

      const runIdDone = getCurrentWorkflowRunId();
      clearActiveWorkflow();
      trackDeckCreationWorkflow('saved', {
        deck_id: json?.id,
        source: 'analysis_panel',
        has_analysis: !!result,
        analysis_score: result?.score,
        workflow_run_id: runIdDone ?? undefined,
      });
      capture('deck_created', {
        deck_id: (json?.id ?? null),
        format,
        source: 'analysis_panel',
        analysis_score: result?.score,
      });
      alert("Saved! Check My Decks.");
    } catch (e: any) {
      const runIdAbandon = getCurrentWorkflowRunId();
      clearActiveWorkflow();
      trackDeckCreationWorkflow('abandoned', {
        current_step: 2,
        abandon_reason: 'save_failed',
        error_message: e?.message,
        workflow_run_id: runIdAbandon ?? undefined,
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
          
          {/* PRO Gate: Export Analysis (workflow pro gate example) */}
          {!isPro && (
            <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                    <span>📤</span>
                    <span>Export Full Analysis</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">PRO</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    Export detailed analysis report, matchup breakdown, and improvement suggestions
                  </div>
                </div>
                <button
                  onClick={() => {
                    trackProGateClicked('export_deck_analysis', 'analysis_workflow', {
                      plan_suggested: 'monthly',
                      reason: 'feature_required',
                    });
                    trackProUpgradeStarted('gate', {
                      feature: 'export_deck_analysis',
                      location: 'analysis_workflow',
                    });
                    window.location.href = '/pricing?source=analysis_export';
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold rounded-lg transition-all"
                >
                  Upgrade to Pro
                </button>
              </div>
            </div>
          )}
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
