/**
 * Compact stats row (chips/badges) replacing the big Commander Intelligence box.
 * Shows: ManaTap sample, Meta Signal, Difficulty, Power Tier, Data Confidence.
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
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 border border-cyan-400/25 text-xs shadow-[0_0_18px_rgba(34,211,238,0.08)]">
      <span className="text-cyan-200/70 uppercase tracking-wider">{label}:</span>
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
        <Chip label="ManaTap Sample" value={count > 0 ? count.toLocaleString() : "Growing"} />
        <Chip label="Meta Signal" value={metaBadge ?? "Global watchlist"} />
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
