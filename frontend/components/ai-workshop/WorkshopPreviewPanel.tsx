"use client";

import type { AiWorkshopDiffRow } from "@/lib/deck/ai-workshop-deck-text";
import { getAiWorkshopActionApplyLabel } from "@/lib/deck/ai-workshop-rules";
import { transformStatsOneLiner } from "@/lib/deck/preview-facts-adapter";
import type { PreviewDiffTab } from "./types";
import type { PendingWorkshopPreview, WorkshopBudgetSwapPair } from "./types";
import { WorkshopWhyPanel } from "./WorkshopWhyPanel";
import { formatUsd } from "@/lib/deck/ai-workshop-helpers";

type Props = {
  preview: PendingWorkshopPreview;
  selectedActionId: string;
  previewDiffTab: PreviewDiffTab;
  adds: AiWorkshopDiffRow[];
  cuts: AiWorkshopDiffRow[];
  selectedAddKeys: Set<string>;
  selectedCutKeys: Set<string>;
  selectedBudgetSwapKeys: Set<string>;
  selectedBudgetSavings: number;
  visibleWarnings: string[];
  previewSummaryLine: string | null;
  showWhy: boolean;
  onPreviewDiffTab: (tab: PreviewDiffTab) => void;
  onToggleAdd: (key: string) => void;
  onToggleCut: (key: string) => void;
  onToggleBudgetSwap: (key: string) => void;
  onSelectAllAdds: () => void;
  onSelectAllCuts: () => void;
  onSelectAllBudgetSwaps: () => void;
  onToggleWhy: () => void;
  onDiscard: () => void;
  onApply: () => void;
  applying: boolean;
  buildDiffKey: (row: AiWorkshopDiffRow) => string;
  buildBudgetSwapKey: (pair: WorkshopBudgetSwapPair) => string;
};

export function WorkshopPreviewPanel({
  preview,
  selectedActionId,
  previewDiffTab,
  adds,
  cuts,
  selectedAddKeys,
  selectedCutKeys,
  selectedBudgetSwapKeys,
  selectedBudgetSavings,
  visibleWarnings,
  previewSummaryLine,
  showWhy,
  onPreviewDiffTab,
  onToggleAdd,
  onToggleCut,
  onToggleBudgetSwap,
  onSelectAllAdds,
  onSelectAllCuts,
  onSelectAllBudgetSwaps,
  onToggleWhy,
  onDiscard,
  onApply,
  applying,
  buildDiffKey,
  buildBudgetSwapKey,
}: Props) {
  const isBudget = preview.mode === "budget_swaps";
  const applyLabel = getAiWorkshopActionApplyLabel(selectedActionId);
  const statsLine =
    previewSummaryLine ?? transformStatsOneLiner(preview.previewFacts ?? undefined);

  return (
    <div className="space-y-4 rounded-xl border border-violet-500/35 bg-violet-950/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white">Review changes</h3>
          {preview.summary ? <p className="mt-1 text-sm text-neutral-300">{preview.summary}</p> : null}
          {statsLine ? <p className="mt-1 text-xs text-neutral-400">{statsLine}</p> : null}
        </div>
        <button
          type="button"
          onClick={onToggleWhy}
          className="min-h-[40px] rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs font-semibold text-violet-100 hover:bg-violet-500/10 touch-manipulation"
        >
          {showWhy ? "Hide why" : "Why?"}
        </button>
      </div>

      {showWhy ? (
        <WorkshopWhyPanel
          whyText={preview.whyText?.trim() || preview.plan?.trim() || ""}
          changeReasons={preview.changeReasons ?? null}
        />
      ) : null}

      {visibleWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          {visibleWarnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      {isBudget ? (
        <div>
          {(preview.budgetSwaps?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-semibold text-amber-50">No budget swaps found</p>
              <p className="mt-2 text-amber-100/90">
                {preview.whyText?.trim()
                  || "The engine could not find a cheaper on-plan replacement for any expensive card at this threshold."}
              </p>
            </div>
          ) : (
          <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-200">
              Budget swaps ({preview.budgetSwaps?.length ?? 0})
              {selectedBudgetSavings > 0 ? (
                <span className="ml-2 text-emerald-300">Save ~{formatUsd(selectedBudgetSavings)}</span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={onSelectAllBudgetSwaps}
              className="text-xs text-violet-300 hover:text-violet-100"
            >
              Select all
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {(preview.budgetSwaps ?? []).map((pair) => {
              const key = buildBudgetSwapKey(pair);
              const checked = selectedBudgetSwapKeys.has(key);
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                    checked ? "border-emerald-500/40 bg-emerald-500/10" : "border-neutral-700 bg-neutral-900/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleBudgetSwap(key)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-white">
                      <span className="text-rose-200">{pair.from}</span>
                      <span className="text-neutral-500"> → </span>
                      <span className="text-emerald-200">{pair.to}</span>
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {formatUsd(pair.priceFrom)} → {formatUsd(pair.priceTo)} (save {formatUsd(pair.savings)})
                    </p>
                    {pair.rationale ? <p className="mt-1 text-xs text-neutral-500">{pair.rationale}</p> : null}
                  </div>
                </label>
              );
            })}
          </div>
          </>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => onPreviewDiffTab("adds")}
              className={`min-h-[40px] rounded-lg px-3 py-1.5 text-sm font-semibold touch-manipulation ${
                previewDiffTab === "adds"
                  ? "bg-emerald-600/30 text-emerald-100"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              Adds ({adds.length})
            </button>
            <button
              type="button"
              onClick={() => onPreviewDiffTab("cuts")}
              className={`min-h-[40px] rounded-lg px-3 py-1.5 text-sm font-semibold touch-manipulation ${
                previewDiffTab === "cuts"
                  ? "bg-rose-600/30 text-rose-100"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              Cuts ({cuts.length})
            </button>
            <button
              type="button"
              onClick={previewDiffTab === "adds" ? onSelectAllAdds : onSelectAllCuts}
              className="ml-auto text-xs text-violet-300 hover:text-violet-100"
            >
              Select all
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {(previewDiffTab === "adds" ? adds : cuts).map((row) => {
              const key = buildDiffKey(row);
              const checked =
                previewDiffTab === "adds" ? selectedAddKeys.has(key) : selectedCutKeys.has(key);
              const reason =
                previewDiffTab === "adds"
                  ? preview.changeReasons?.added?.[row.name.trim().toLowerCase()]
                  : preview.changeReasons?.removed?.[row.name.trim().toLowerCase()];
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                    checked
                      ? previewDiffTab === "adds"
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-rose-500/40 bg-rose-500/10"
                      : "border-neutral-700 bg-neutral-900/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      previewDiffTab === "adds" ? onToggleAdd(key) : onToggleCut(key)
                    }
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-white">
                      {row.qty}x {row.name}
                      {row.zone === "sideboard" ? (
                        <span className="ml-2 text-xs text-neutral-500">(SB)</span>
                      ) : null}
                    </p>
                    {reason ? <p className="mt-1 text-xs text-neutral-400">{reason}</p> : null}
                  </div>
                </label>
              );
            })}
            {(previewDiffTab === "adds" ? adds : cuts).length === 0 ? (
              <p className="text-sm text-neutral-500">No changes in this tab.</p>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="min-h-[44px] flex-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-60 touch-manipulation"
        >
          {applying ? "Applying…" : applyLabel}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={applying}
          className="min-h-[44px] rounded-lg border border-neutral-600 px-4 py-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 touch-manipulation"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
