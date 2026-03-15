"use client";

import React from "react";

interface AnalysisFeedbackRowProps {
  score?: number;
  deckId?: string;
  promptVersion?: string | null;
}

export default function AnalysisFeedbackRow({ score, deckId, promptVersion }: AnalysisFeedbackRowProps) {
  const [submitted, setSubmitted] = React.useState(false);

  const submit = React.useCallback(async (rating: number) => {
    setSubmitted(true);
    try {
      const body: Record<string, unknown> = {
        rating,
        source: "deck_analysis",
      };
      if (score != null) body.score = score;
      if (deckId) body.deck_id = deckId;

      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // fail-open: ignore
    }
    try {
      const { capture } = await import("@/lib/ph");
      capture("analysis_feedback_submitted", {
        rating,
        feature: "deck_analysis",
        ...(deckId != null && deckId !== "" && { deck_id: deckId }),
        ...(score != null && { score }),
        ...(promptVersion != null && promptVersion !== "" && { prompt_version: promptVersion }),
      });
    } catch {
      // fail-open
    }
  }, [score, deckId, promptVersion]);

  if (submitted) return null;

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 px-3 py-2 flex items-center gap-3 flex-wrap">
      <span className="text-sm text-neutral-300">Was this analysis useful?</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => submit(5)}
          className="px-2 py-1 rounded border border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-sm"
          aria-label="Yes"
        >
          👍 Yes
        </button>
        <button
          type="button"
          onClick={() => submit(2)}
          className="px-2 py-1 rounded border border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-sm"
          aria-label="Not really"
        >
          👎 Not really
        </button>
      </div>
    </div>
  );
}
