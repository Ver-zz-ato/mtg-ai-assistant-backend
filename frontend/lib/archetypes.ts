/**
 * Archetype and strategy helpers for discovery pages.
 * Two-signal logic: preferTags overlap AND deck_count > 0 from commander_aggregates.
 */

import { createClient } from "@/lib/supabase/server";
import { COMMANDERS, type CommanderProfile } from "@/lib/commanders";
import { getArchetypeBySlug, getAllArchetypeSlugs } from "@/lib/data/archetypes";
import { getStrategyBySlug, getAllStrategySlugs } from "@/lib/data/strategies";

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
  return grounded.length > 0 ? grounded : withTagMatch;
}

export async function getCommandersByStrategy(slug: string): Promise<CommanderProfile[]> {
  const strategy = getStrategyBySlug(slug);
  if (!strategy) return [];

  const tagSet = new Set(strategy.tagMatches.map((t) => t.toLowerCase()));

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
  return grounded.length > 0 ? grounded : withTagMatch;
}

export { getArchetypeBySlug, getAllArchetypeSlugs } from "@/lib/data/archetypes";
export { getStrategyBySlug, getAllStrategySlugs } from "@/lib/data/strategies";
