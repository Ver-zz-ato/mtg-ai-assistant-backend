"use client";

import Link from "next/link";
import { getAiWorkshopActionApplyLabel } from "@/lib/deck/ai-workshop-rules";
import { transformStatsOneLiner } from "@/lib/deck/preview-facts-adapter";
import type { WorkshopResultMeta } from "./types";
import { WorkshopWhyPanel } from "./WorkshopWhyPanel";

type Props = {
  selectedActionId: string;
  resultMeta: WorkshopResultMeta;
  appliedMetaChips: string[];
  latestAdds: number;
  latestCuts: number;
  showWhy: boolean;
  canUndo: boolean;
  saving: boolean;
  onToggleWhy: () => void;
  onUndo: () => void;
  onSave: () => void;
  onRunAnother: () => void;
};

export function WorkshopAppliedBanner({
  selectedActionId,
  resultMeta,
  appliedMetaChips,
  latestAdds,
  latestCuts,
  showWhy,
  canUndo,
  saving,
  onToggleWhy,
  onUndo,
  onSave,
  onRunAnother,
}: Props) {
  const summaryLine = transformStatsOneLiner(resultMeta.previewFacts ?? undefined);
  const whyText = resultMeta.whyText?.trim() || resultMeta.plan?.trim() || resultMeta.summary?.trim() || "";

  return (
    <div className="space-y-4 rounded-xl border border-emerald-500/35 bg-emerald-950/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-emerald-100">Pass applied</h3>
          {resultMeta.summary ? (
            <p className="mt-1 text-sm text-neutral-300">{resultMeta.summary}</p>
          ) : null}
          {summaryLine ? <p className="mt-1 text-xs text-neutral-400">{summaryLine}</p> : null}
        </div>
        <button
          type="button"
          onClick={onToggleWhy}
          className="min-h-[40px] rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/10 touch-manipulation"
        >
          {showWhy ? "Hide why" : "Why?"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {appliedMetaChips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-neutral-700 bg-black/30 px-2 py-0.5 text-xs text-neutral-300"
          >
            {chip}
          </span>
        ))}
        {latestAdds > 0 ? (
          <span className="rounded-full border border-emerald-600/40 bg-emerald-600/10 px-2 py-0.5 text-xs text-emerald-200">
            +{latestAdds} added
          </span>
        ) : null}
        {latestCuts > 0 ? (
          <span className="rounded-full border border-rose-600/40 bg-rose-600/10 px-2 py-0.5 text-xs text-rose-200">
            -{latestCuts} removed
          </span>
        ) : null}
      </div>

      {showWhy && whyText ? (
        <WorkshopWhyPanel whyText={whyText} changeReasons={resultMeta.changeReasons ?? null} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="min-h-[44px] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60 touch-manipulation"
        >
          {saving ? "Saving…" : "Save refined deck"}
        </button>
        <button
          type="button"
          onClick={onRunAnother}
          className="min-h-[44px] rounded-lg border border-violet-500/50 bg-violet-600/20 px-4 py-2 text-sm font-bold text-violet-100 hover:bg-violet-600/30 touch-manipulation"
        >
          Run another pass
        </button>
        {canUndo ? (
          <button
            type="button"
            onClick={onUndo}
            className="min-h-[44px] rounded-lg border border-neutral-600 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 touch-manipulation"
          >
            Undo
          </button>
        ) : null}
        <Link
          href="/mtg-deck-checker"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-neutral-600 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 touch-manipulation"
        >
          Analyze deck
        </Link>
      </div>
      <p className="text-xs text-neutral-500">
        Last pass: {getAiWorkshopActionApplyLabel(selectedActionId).replace("Fix ", "")}
      </p>
    </div>
  );
}
