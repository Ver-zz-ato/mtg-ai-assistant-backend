/**
 * Compact stats row (chips/badges) replacing the big Commander Intelligence box.
 * Shows: Decks Tracked, Meta Signal, Difficulty, Power Tier, Data Confidence.
 */

import {
  getDataConfidence,
  getDataConfidenceCopy,
  type DataConfidence,
} from "@/lib/commander-data-confidence";

export type CommanderStatsRowData = {
  deckCount: number | null;
  medianDeckCostUSD: number | null;
  metaBadge: "Trending" | "Most Played" | null;
  difficultyLabel: string | null;
  powerTier: string | null;
};

const COST_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Props = {
  data: CommanderStatsRowData;
};

function Chip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700 text-xs">
      <span className="text-neutral-500 uppercase tracking-wider">{label}:</span>
      <span className="font-medium text-white">{value}</span>
    </span>
  );
}

export function CommanderStatsRow({ data }: Props) {
  const {
    deckCount,
    medianDeckCostUSD,
    metaBadge,
    difficultyLabel,
    powerTier,
  } = data;

  const count = deckCount ?? 0;
  const confidence: DataConfidence = getDataConfidence(count);
  const confidenceCopy = getDataConfidenceCopy(confidence);

  const costValue =
    medianDeckCostUSD != null && medianDeckCostUSD > 0
      ? COST_FORMAT.format(medianDeckCostUSD)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Chip label="Decks Tracked" value={count > 0 ? count.toLocaleString() : "—"} />
        <Chip label="Meta Signal" value={metaBadge ?? "—"} />
        <Chip label="Difficulty" value={difficultyLabel ?? "—"} />
        {powerTier && <Chip label="Power Tier" value={powerTier} />}
        <Chip label="Data Confidence" value={confidence} />
        {costValue && <Chip label="Typical Cost" value={costValue} />}
      </div>
      {confidenceCopy && (
        <p className="text-xs text-neutral-400" role="status">
          {confidenceCopy}
        </p>
      )}
    </div>
  );
}
