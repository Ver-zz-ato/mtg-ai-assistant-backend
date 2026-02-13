/**
 * Horizontal stats ribbon for commander hub and content pages.
 * SSR-only, no empty placeholders.
 */

import Link from "next/link";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";
import type { CommanderProfile } from "@/lib/commanders";
import type { CommanderAggregates } from "@/lib/commander-aggregates";
import { deriveCommanderSnapshot } from "@/lib/seo/commander-content";

type Props = {
  profile: CommanderProfile;
  aggregates: CommanderAggregates | null;
};

export function CommanderStatsRibbon({ profile, aggregates }: Props) {
  const snapshot = deriveCommanderSnapshot(profile);
  const tags = new Set((profile.tags ?? []).map((t) => t.toLowerCase()));
  const archetypes = ARCHETYPES.filter((a) => a.tagMatches.some((m) => tags.has(m.toLowerCase()))).slice(0, 2);
  const strategies = STRATEGIES.filter((s) => s.tagMatches.some((m) => tags.has(m.toLowerCase()))).slice(0, 2);
  const themeLabels = [...archetypes.map((a) => a.title), ...strategies.map((s) => s.title)].slice(0, 3);

  const items: Array<{ label: string; value: string; href?: string }> = [];

  if (aggregates && aggregates.deckCount > 0) {
    items.push({
      label: "Public decks",
      value: `${aggregates.deckCount}`,
    });
  }

  if (aggregates?.medianDeckCost != null && aggregates.medianDeckCost > 0) {
    items.push({
      label: "Median cost",
      value: `~$${Math.round(aggregates.medianDeckCost).toLocaleString()}`,
    });
  }

  if (themeLabels.length > 0) {
    const first = archetypes[0];
    const strat = strategies[0];
    if (first) {
      items.push({ label: "Archetype", value: first.title, href: `/commander-archetypes/${first.slug}` });
    } else if (strat) {
      items.push({ label: "Strategy", value: strat.title, href: `/strategies/${strat.slug}` });
    } else {
      items.push({ label: "Themes", value: themeLabels.join(", ") });
    }
  }

  items.push({ label: "Difficulty", value: snapshot.difficulty });

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-800/80 border border-neutral-700 text-sm">
          <span className="text-neutral-500">{item.label}:</span>
          {item.href ? (
            <Link href={item.href} className="text-cyan-400 hover:underline">
              {item.value}
            </Link>
          ) : (
            <span className="text-neutral-200">{item.value}</span>
          )}
        </span>
      ))}
    </div>
  );
}
