/**
 * Archetype and strategy helpers for discovery pages.
 * Two-signal logic: preferTags overlap AND deck_count > 0 from commander_aggregates.
 */

import { createClient } from "@/lib/supabase/server";
import { COMMANDERS, type CommanderProfile } from "@/lib/commanders";
import { getArchetypeBySlug } from "@/lib/data/archetypes";
import { getStrategyBySlug } from "@/lib/data/strategies";
import { getGlobalMetaCommanders } from "@/lib/meta/global-meta-entities";

const STRATEGY_ALIASES: Record<string, string[]> = {
  ramp: ["ramp", "lands", "landfall", "big mana", "mana", "treasure", "value", "draw", "tokens"],
  tokens: ["tokens", "token", "goblins", "elves", "vampires", "zombies", "go-wide", "combat", "anthem", "aristocrats"],
  sacrifice: ["sacrifice", "aristocrats", "death", "graveyard", "recursion", "lifedrain", "food", "treasure", "reanimation"],
  control: ["control", "stax", "tax", "pillowfort", "politics", "tempo", "spellslinger", "removal", "counter", "blink"],
  aggro: ["aggro", "combat", "haste", "attack", "equipment", "voltron", "vampires", "warriors", "dragons", "extra combat"],
  combo: ["combo", "storm", "toolbox", "untap", "bounce", "cost reduction", "reanimation", "artifacts", "spellslinger"],
};

async function sortByMetaSignal(commanders: CommanderProfile[]): Promise<CommanderProfile[]> {
  const metaRows = await getGlobalMetaCommanders(150).catch(() => []);
  const score = new Map(
    metaRows.map((row) => [
      row.slug,
      (row.trendingRank ? 1000 - row.trendingRank * 4 : 0) +
        (row.mostPlayedRank ? 600 - row.mostPlayedRank * 2 : 0),
    ])
  );
  return [...commanders].sort((a, b) => (score.get(b.slug) ?? 0) - (score.get(a.slug) ?? 0));
}

/** Commanders with tag match AND deck_count > 0. Fallback to tag-only if empty. */
export async function getCommandersByArchetype(slug: string): Promise<CommanderProfile[]> {
  const archetype = getArchetypeBySlug(slug);
  if (!archetype) return [];

  const tagSet = new Set(archetype.tagMatches.map((t) => t.toLowerCase()));

  const withTagMatch = COMMANDERS.filter((c) => {
    const tags = (c.tags ?? []).map((t) => t.toLowerCase());
    return tags.some((t) => tagSet.has(t));
  });

  if (withTagMatch.length === 0) return [];

  const supabase = await createClient();
  const { data: agg } = await supabase
    .from("commander_aggregates")
    .select("commander_slug, deck_count")
    .in("commander_slug", withTagMatch.map((c) => c.slug));

  const withDecks = new Set(
    (agg ?? []).filter((r) => (r.deck_count ?? 0) > 0).map((r) => r.commander_slug)
  );

  const grounded = withTagMatch.filter((c) => withDecks.has(c.slug));
  return sortByMetaSignal(grounded.length > 0 ? grounded : withTagMatch);
}

export async function getCommandersByStrategy(slug: string): Promise<CommanderProfile[]> {
  const strategy = getStrategyBySlug(slug);
  if (!strategy) return [];

  const tagSet = new Set([
    ...strategy.tagMatches,
    ...(STRATEGY_ALIASES[slug] ?? []),
  ].map((t) => t.toLowerCase()));

  const withTagMatch = COMMANDERS.filter((c) => {
    const tags = (c.tags ?? []).map((t) => t.toLowerCase());
    const haystack = `${c.name} ${tags.join(" ")}`.toLowerCase();
    return tags.some((t) => tagSet.has(t) || [...tagSet].some((alias) => t.includes(alias))) ||
      [...tagSet].some((alias) => haystack.includes(alias));
  });

  if (withTagMatch.length === 0) return [];

  const supabase = await createClient();
  const { data: agg } = await supabase
    .from("commander_aggregates")
    .select("commander_slug, deck_count")
    .in("commander_slug", withTagMatch.map((c) => c.slug));

  const withDecks = new Set(
    (agg ?? []).filter((r) => (r.deck_count ?? 0) > 0).map((r) => r.commander_slug)
  );

  const grounded = withTagMatch.filter((c) => withDecks.has(c.slug));
  const sorted = await sortByMetaSignal(grounded.length > 0 ? grounded : withTagMatch);
  const bySlug = new Map(sorted.map((c) => [c.slug, c]));
  const metaRows = await getGlobalMetaCommanders(220).catch(() => []);
  const catalogBySlug = new Map(COMMANDERS.map((c) => [c.slug, c]));

  for (const row of metaRows) {
    if (bySlug.size >= 36) break;
    const catalogProfile = catalogBySlug.get(row.slug);
    if (!catalogProfile || bySlug.has(row.slug)) continue;
    const tags = (catalogProfile.tags ?? []).map((t) => t.toLowerCase());
    const haystack = `${catalogProfile.name} ${tags.join(" ")}`.toLowerCase();
    if ([...tagSet].some((alias) => haystack.includes(alias))) {
      bySlug.set(catalogProfile.slug, catalogProfile);
    }
  }

  return Array.from(bySlug.values());
}

export { getArchetypeBySlug, getAllArchetypeSlugs } from "@/lib/data/archetypes";
export { getStrategyBySlug, getAllStrategySlugs } from "@/lib/data/strategies";
