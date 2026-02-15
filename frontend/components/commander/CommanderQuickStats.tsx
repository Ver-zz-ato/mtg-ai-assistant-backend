/**
 * Above-the-fold quick stats for commander hub.
 * Compact 2-row stat grid. Shows skeleton when data missing.
 */

import Link from "next/link";
import type { CommanderProfile } from "@/lib/commanders";
import type { CommanderAggregates } from "@/lib/commander-aggregates";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";

export type QuickStatsData = {
  /** budget/mid/high from cost-landing-data */
  costRange?: { budget: number; mid: number; high: number } | null;
  metaRank?: string | null; // e.g. "Top 20 most played"
};

type Props = {
  profile: CommanderProfile;
  aggregates: CommanderAggregates | null;
  quickStats?: QuickStatsData | null;
};

function StatSkeleton() {
  return <div className="h-5 w-16 rounded bg-neutral-700/60 animate-pulse" />;
}

export function CommanderQuickStats({ profile, aggregates, quickStats }: Props) {
  const tags = new Set((profile.tags ?? []).map((t) => t.toLowerCase()));
  const archetype = ARCHETYPES.find((a) => a.tagMatches.some((m) => tags.has(m.toLowerCase())));
  const strategy = STRATEGIES.find((s) => s.tagMatches.some((m) => tags.has(m.toLowerCase())));

  const hasCost = (quickStats?.costRange && (quickStats.costRange.budget > 0 || quickStats.costRange.mid > 0)) ||
    (aggregates?.medianDeckCost != null && aggregates.medianDeckCost > 0);
  const deckCount = aggregates?.deckCount ?? 0;

  const stats: Array<{ label: string; value: React.ReactNode; href?: string }> = [];

  if (hasCost) {
    const low = quickStats?.costRange?.budget ?? Math.round((aggregates!.medianDeckCost ?? 0) * 0.4);
    const high = quickStats?.costRange?.high ?? Math.round((aggregates!.medianDeckCost ?? 0) * 2);
    const mid = quickStats?.costRange?.mid ?? Math.round(aggregates!.medianDeckCost ?? 0);
    stats.push({
      label: "Deck cost",
      value: (
        <span className="font-semibold text-white">
          ${low.toLocaleString()}–${high.toLocaleString()}
        </span>
      ),
    });
  }

  if (deckCount > 0) {
    stats.push({
      label: "Tracked decks",
      value: (
        <span className="font-medium text-neutral-200">
          {deckCount.toLocaleString()}
        </span>
      ),
    });
  }

  if (archetype) {
    stats.push({
      label: "Archetype",
      value: archetype.title,
      href: `/commander-archetypes/${archetype.slug}`,
    });
  } else if (strategy) {
    stats.push({
      label: "Strategy",
      value: strategy.title,
      href: `/strategies/${strategy.slug}`,
    });
  }

  if (quickStats?.metaRank) {
    stats.push({
      label: "Meta",
      value: quickStats.metaRank,
      href: "/meta/most-played-commanders",
    });
  }

  if (stats.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <StatSkeleton />
              <div className="h-3 w-12 rounded bg-neutral-700/40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-4 mb-6">
      <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
        Quick stats
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="space-y-0.5">
            <div className="text-[10px] uppercase text-neutral-500">{s.label}</div>
            {s.href ? (
              <Link href={s.href} className="text-cyan-400 hover:underline font-medium">
                {s.value}
              </Link>
            ) : (
              <div>{s.value}</div>
            )}
          </div>
        ))}
      </div>
      {deckCount > 0 && hasCost && (
        <p className="text-xs text-neutral-500 mt-3">
          Based on {deckCount.toLocaleString()} tracked decks
        </p>
      )}
    </div>
  );
}
