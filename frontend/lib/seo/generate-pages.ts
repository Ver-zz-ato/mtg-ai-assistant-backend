/**
 * Generate SEO page candidates from seo_queries.
 * Used by the admin API route and the publish-seo-pages script.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyQuery } from "@/lib/seo/queryClassifier";
import { getTopCards } from "@/lib/top-cards";
import { getFirst50CommanderSlugs } from "@/lib/commanders";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";

const MAX_QUERIES = 500;
const DEFAULT_LIMIT = 500;

const BLOCKLIST = ["reddit", "decklist", "proxy", "download", "tier list", "tier list site"];

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSlug(
  type: string,
  entities: { commanderSlug?: string; cardSlug?: string; archetypeSlug?: string; strategySlug?: string }
): string {
  if (entities.commanderSlug && ["commander_mulligan", "commander_budget", "commander_cost", "commander_best_cards"].includes(type)) {
    const suffix = type === "commander_mulligan" ? "mulligan" : type === "commander_budget" ? "budget" : type === "commander_cost" ? "cost" : "best-cards";
    return `${entities.commanderSlug}-${suffix}`;
  }
  if (entities.cardSlug && ["card_price", "card_decks"].includes(type)) {
    return type === "card_price" ? `${entities.cardSlug}-price` : `${entities.cardSlug}-decks`;
  }
  if (entities.archetypeSlug) return `${entities.archetypeSlug}-commander-decks`;
  if (entities.strategySlug) return `${entities.strategySlug}-commander`;
  return toSlug(type);
}

function canonicalExists(
  type: string,
  entities: { commanderSlug?: string; cardSlug?: string; archetypeSlug?: string; strategySlug?: string },
  commanderSlugs: string[],
  archetypeSlugs: string[],
  strategySlugs: string[],
  topCardSlugs: string[]
): boolean {
  if (type === "commander_mulligan" || type === "commander_budget" || type === "commander_best_cards") {
    return !!entities.commanderSlug && commanderSlugs.includes(entities.commanderSlug);
  }
  if (type === "commander_cost") return false;
  if (type === "archetype") return !!entities.archetypeSlug && archetypeSlugs.includes(entities.archetypeSlug);
  if (type === "strategy") return !!entities.strategySlug && strategySlugs.includes(entities.strategySlug);
  if (type === "card_price" || type === "card_decks") {
    return !!entities.cardSlug && topCardSlugs.includes(entities.cardSlug);
  }
  return false;
}

function computeQualityScore(
  result: { type: string; entities: Record<string, string | undefined>; confidence: string },
  query: string
): number {
  let score = 0;
  if (result.entities.commanderSlug) score += 2;
  if (result.entities.cardName || result.entities.cardSlug) score += 2;
  if (result.entities.archetypeSlug || result.entities.strategySlug) score += 1;
  if (result.confidence === "high") score += 1;
  if (query.trim().length < 4) score -= 2;
  const qLower = query.toLowerCase();
  if (BLOCKLIST.some((b) => qLower.includes(b))) score -= 2;
  return score;
}

export async function generateSeoPages(admin: SupabaseClient, limit = DEFAULT_LIMIT): Promise<{ generated: number; slugs: string[] }> {
  const capLimit = Math.min(limit, MAX_QUERIES);

  const topCards = await getTopCards();
  const topCardNames = topCards.map((c) => c.card_name);
  const topCardSlugs = topCards.map((c) => c.slug);
  const commanderSlugs = getFirst50CommanderSlugs();
  const archetypeSlugs = ARCHETYPES.map((a) => a.slug);
  const strategySlugs = STRATEGIES.map((s) => s.slug);

  const { data: queries, error: qErr } = await admin
    .from("seo_queries")
    .select("query, clicks, impressions")
    .order("impressions", { ascending: false })
    .limit(capLimit * 2);

  if (qErr || !queries?.length) {
    return { generated: 0, slugs: [] };
  }

  const { data: existing } = await admin.from("seo_pages").select("slug").limit(5000);
  const existingSlugs = new Set((existing ?? []).map((r: { slug: string }) => r.slug));

  const seenSlugs = new Set<string>();
  const candidates: Array<{
    slug: string;
    title: string;
    description: string;
    template: string;
    query: string;
    commander_slug: string | null;
    card_name: string | null;
    archetype_slug: string | null;
    strategy_slug: string | null;
    priority: number;
    quality_score: number;
  }> = [];

  for (const row of queries as Array<{ query: string; clicks: number; impressions: number }>) {
    const result = classifyQuery(row.query, { topCardNames });
    if (!result || result.confidence === "low") continue;

    if (canonicalExists(result.type, result.entities, commanderSlugs, archetypeSlugs, strategySlugs, topCardSlugs)) continue;

    const qualityScore = computeQualityScore(result, row.query);
    if (qualityScore < 1) continue;

    const slug = buildSlug(result.type, result.entities);
    if (existingSlugs.has(slug) || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const priority = (row.clicks ?? 0) * 10 + (row.impressions ?? 0);

    const title =
      result.type.startsWith("commander_") && result.entities.commanderSlug
        ? `${result.entities.commanderSlug
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")} ${result.type === "commander_mulligan" ? "Mulligan" : result.type === "commander_budget" ? "Budget" : result.type === "commander_cost" ? "Cost" : "Best Cards"} Guide`
        : result.type === "card_price" && result.entities.cardName
          ? `${result.entities.cardName} Price`
          : result.type === "card_decks" && result.entities.cardName
            ? `${result.entities.cardName} Commander Decks`
            : result.type === "archetype" && result.entities.archetypeSlug
              ? `${result.entities.archetypeSlug} Commander Decks`
              : result.type === "strategy" && result.entities.strategySlug
                ? `${result.entities.strategySlug} Commander Strategy`
                : row.query;

    const description = `Discover ${row.query} on ManaTap. Browse decks, mulligan tools, cost to finish, and budget swaps.`;

    candidates.push({
      slug,
      title,
      description,
      template: result.type,
      query: row.query,
      commander_slug: result.entities.commanderSlug ?? null,
      card_name: result.entities.cardName ?? null,
      archetype_slug: result.entities.archetypeSlug ?? null,
      strategy_slug: result.entities.strategySlug ?? null,
      priority,
      quality_score: qualityScore,
    });

    if (candidates.length >= capLimit) break;
  }

  if (candidates.length === 0) {
    return { generated: 0, slugs: [] };
  }

  const { error: insErr } = await admin.from("seo_pages").insert(
    candidates.map((c) => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      template: c.template,
      query: c.query,
      commander_slug: c.commander_slug,
      card_name: c.card_name,
      archetype_slug: c.archetype_slug,
      strategy_slug: c.strategy_slug,
      priority: c.priority,
      quality_score: c.quality_score,
      status: "draft",
      indexing: "noindex",
    }))
  );

  if (insErr) {
    throw new Error(insErr.message);
  }

  return { generated: candidates.length, slugs: candidates.map((c) => c.slug) };
}
