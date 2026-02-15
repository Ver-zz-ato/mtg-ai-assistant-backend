/**
 * Commander Intelligence Panel — above-the-fold at-a-glance stats.
 * SSR-only, uses commander_aggregates + meta_signals + profile.
 * Degrades gracefully when data is missing.
 */

import { getColorLabel } from "@/lib/seo/commander-content";
import { ARCHETYPES } from "@/lib/data/archetypes";
import type { CommanderProfile } from "@/lib/commanders";

export type CommanderIntelligenceData = {
  deckCount: number | null;
  medianDeckCostUSD: number | null;
  archetypeLabel: string | null;
  colorsLabel: string | null;
  metaBadge: "Trending" | "Most Played" | null;
  difficultyLabel: string | null;
  lowSample: boolean;
};

const COST_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const COUNT_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Props = {
  data: CommanderIntelligenceData;
};

function StatChip({
  label,
  value,
  subtext,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="font-semibold text-white">{value}</div>
      {subtext && (
        <div className="text-xs text-amber-500/90" role="status">
          {subtext}
        </div>
      )}
    </div>
  );
}

export function CommanderIntelligencePanel({ data }: Props) {
  const {
    deckCount,
    medianDeckCostUSD,
    archetypeLabel,
    colorsLabel,
    metaBadge,
    difficultyLabel,
    lowSample,
  } = data;

  const deckValue =
    deckCount != null
      ? COUNT_FORMAT.format(deckCount)
      : "—";
  const costValue =
    medianDeckCostUSD != null && medianDeckCostUSD > 0
      ? COST_FORMAT.format(medianDeckCostUSD)
      : "—";

  return (
    <section
      className="rounded-xl border border-neutral-700 bg-neutral-800/60 backdrop-blur-sm p-5 mb-6"
      aria-label="Commander at-a-glance stats"
    >
      <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4">
        Commander Intelligence
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
        <StatChip
          label="Decks Tracked"
          value={deckValue}
          subtext={lowSample ? "Low sample" : null}
        />
        <StatChip
          label="Typical Deck Cost"
          value={
            medianDeckCostUSD != null && medianDeckCostUSD > 0 ? (
              <span>
                {costValue}
                <span className="text-xs font-normal text-neutral-500 ml-1">(Median)</span>
              </span>
            ) : (
              "—"
            )
          }
        />
        <StatChip label="Archetype" value={archetypeLabel ?? "—"} />
        <StatChip label="Colors" value={colorsLabel ?? "—"} />
        <StatChip label="Meta Signal" value={metaBadge ?? "—"} />
        <StatChip label="Difficulty" value={difficultyLabel ?? "—"} />
      </div>
      {lowSample && (
        <p className="text-xs text-neutral-500 mt-3" role="status">
          Not enough data yet — more decks will improve accuracy.
        </p>
      )}
    </section>
  );
}

/** Build panel data from profile, aggregates, snapshot, and meta badge. */
export function buildCommanderIntelligenceData(
  profile: CommanderProfile,
  aggregates: { deckCount: number; medianDeckCost: number | null } | null,
  snapshot: { difficulty: string },
  metaBadge: "Trending" | "Most Played" | null,
  medianCostFallback?: number | null
): CommanderIntelligenceData {
  const deckCount = aggregates?.deckCount ?? null;
  const lowSample = deckCount != null && deckCount < 5;

  const tags = new Set((profile.tags ?? []).map((t) => t.toLowerCase()));
  const archetype = ARCHETYPES.find((a) =>
    a.tagMatches.some((m) => tags.has(m.toLowerCase()))
  );
  const archetypeLabel = archetype?.title ?? null;

  const colorsLabel = profile.colors?.length
    ? getColorLabel(profile.colors)
    : null;

  const rawCost =
    aggregates?.medianDeckCost != null && aggregates.medianDeckCost > 0
      ? aggregates.medianDeckCost
      : (medianCostFallback != null && medianCostFallback > 0 ? medianCostFallback : null);

  return {
    deckCount,
    medianDeckCostUSD: rawCost != null ? Math.round(rawCost) : null,
    archetypeLabel,
    colorsLabel,
    metaBadge,
    difficultyLabel: snapshot.difficulty ?? null,
    lowSample,
  };
}
