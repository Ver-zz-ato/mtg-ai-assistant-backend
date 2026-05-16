import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildCommanderRecommendations } from "@/lib/recommendations/commander-recommender";
import {
  aiRerankRecommendations,
  buildRecommendationIntent,
  rankGroundedCandidates,
  type RecommendationRouteKind,
} from "@/lib/recommendations/recommendation-pipeline";
import {
  buildTagProfile,
  fetchGroundedCandidatesForProfile,
  fetchTagGroundedRowsByNames,
  type CategoryKey,
  type GroundedCardCandidate,
} from "@/lib/recommendations/tag-grounding";

type TierMode = "guest" | "free" | "pro";

type BenchmarkResult = {
  id: string;
  group: string;
  route: string;
  passed: boolean;
  message: string;
  sample?: unknown;
};

type DeckSample = {
  deck_id: string;
  commander: string | null;
  format: string;
  deck_text: string;
  title: string | null;
  colors: string[];
};

function loadDotEnv(fileName: string) {
  const file = path.join(process.cwd(), fileName);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

function norm(str: string): string {
  return String(str || "").trim().toLowerCase();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function deckTextToNames(deckText: string): string[] {
  return deckText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+x?\s+/, "").replace(/\s+\(.*\)\s*$/, "").trim())
    .filter((line) => line.length > 1 && !/^(commander|sideboard|deck|maybeboard):/i.test(line));
}

function hasAnyTag(rows: Array<{
  theme_tags?: string[] | null;
  gameplay_tags?: string[] | null;
  archetype_tags?: string[] | null;
  commander_tags?: string[] | null;
}>, expectedTags: string[]): boolean {
  const wanted = new Set(expectedTags);
  return rows.some((row) =>
    [...(row.theme_tags ?? []), ...(row.gameplay_tags ?? []), ...(row.archetype_tags ?? []), ...(row.commander_tags ?? [])].some((tag) => wanted.has(tag)),
  );
}

function hasUniqueReasons<T extends { fitReason?: string; reason?: string }>(rows: T[], min = 2): boolean {
  const reasons = rows
    .map((row) => String(row.fitReason ?? row.reason ?? "").trim())
    .filter(Boolean);
  return new Set(reasons).size >= min;
}

function tierArgs(tier: TierMode) {
  if (tier === "guest") return { isGuest: true, isPro: false, userId: null as string | null };
  if (tier === "free") return { isGuest: false, isPro: false, userId: "free-benchmark-user" };
  return { isGuest: false, isPro: true, userId: "pro-benchmark-user" };
}

async function fetchRealDeckSamples(admin: SupabaseClient, count = 10): Promise<DeckSample[]> {
  const { data: decks, error } = await admin
    .from("decks")
    .select("id, title, commander, format, colors, deck_text")
    .or("is_public.eq.true,public.eq.true")
    .order("updated_at", { ascending: false })
    .limit(count * 10);
  if (error) throw new Error(error.message);
  const selected: DeckSample[] = [];
  for (const deck of decks ?? []) {
    if (selected.length >= count) break;
    let deckText = String((deck as any).deck_text || "").trim();
    if (deckText.length < 20) {
      const { data: cards } = await admin
        .from("deck_cards")
        .select("name, qty")
        .eq("deck_id", (deck as any).id)
        .order("created_at", { ascending: true });
      if (cards?.length) {
        deckText = cards.map((c: any) => `${c.qty || 1} ${c.name}`).join("\n");
      }
    }
    if (deckText.length < 20) continue;
    selected.push({
      deck_id: String((deck as any).id),
      commander: (deck as any).commander ? String((deck as any).commander) : null,
      format: String((deck as any).format || "Commander"),
      deck_text: deckText,
      title: (deck as any).title ? String((deck as any).title) : null,
      colors: Array.isArray((deck as any).colors) ? (deck as any).colors.map((v: unknown) => String(v)) : [],
    });
  }
  return selected;
}

async function runCommanderBenchmarks(admin: SupabaseClient): Promise<BenchmarkResult[]> {
  const scenarios = [
    { id: "tokens", expectedTags: ["tokens", "go_wide", "payoff"], request: { answers: { theme: "tokens", pace: "aggro", interaction: "moderate", complexity: "simple", budget: "budget" }, traits: { aggression: 75, control: 25, comboAppetite: 20, interactionPref: 45, gameLengthPref: 40, budgetElasticity: 25 }, powerLevel: "Casual", budget: "Budget", vibe: "tokens go wide creature tokens", limit: 6 } },
    { id: "graveyard", expectedTags: ["graveyard", "recursion", "reanimator"], request: { answers: { theme: "graveyard", pace: "value", interaction: "heavy", complexity: "complex", budget: "moderate" }, traits: { aggression: 20, control: 70, comboAppetite: 55, interactionPref: 80, gameLengthPref: 70, budgetElasticity: 55 }, powerLevel: "Focused", budget: "Moderate", vibe: "graveyard recursion reanimator", limit: 6 } },
    { id: "spellslinger", expectedTags: ["spellslinger", "spell_combo", "card_draw"], request: { answers: { theme: "spells", pace: "combo", interaction: "heavy", complexity: "complex", budget: "high" }, traits: { aggression: 35, control: 60, comboAppetite: 85, interactionPref: 70, gameLengthPref: 50, budgetElasticity: 80 }, powerLevel: "Optimized", budget: "High", vibe: "spellslinger storm copy spells", limit: 6 } },
    { id: "artifacts", expectedTags: ["artifacts", "engine", "big_mana"], request: { answers: { theme: "artifacts", pace: "value", interaction: "moderate", complexity: "complex", budget: "moderate" }, traits: { aggression: 35, control: 55, comboAppetite: 45, interactionPref: 50, gameLengthPref: 55, budgetElasticity: 55 }, powerLevel: "Focused", budget: "Moderate", vibe: "artifact engine treasures clues", limit: 6 } },
    { id: "enchantments", expectedTags: ["enchantments", "value", "engine"], request: { answers: { theme: "enchantments", pace: "control", interaction: "moderate", complexity: "complex", budget: "moderate" }, traits: { aggression: 20, control: 68, comboAppetite: 30, interactionPref: 52, gameLengthPref: 65, budgetElasticity: 50 }, powerLevel: "Focused", budget: "Moderate", vibe: "enchantress constellation auras", limit: 6 } },
    { id: "tribal", expectedTags: ["tribal", "tribal_commander", "aggro"], request: { answers: { theme: "tribal", pace: "aggro", interaction: "moderate", complexity: "simple", budget: "moderate" }, traits: { aggression: 72, control: 20, comboAppetite: 18, interactionPref: 35, gameLengthPref: 45, budgetElasticity: 45 }, powerLevel: "Casual", budget: "Moderate", vibe: "tribal dragons and big attacks", limit: 6 } },
    { id: "blink", expectedTags: ["blink", "etb", "engine"], request: { answers: { theme: "blink", pace: "value", interaction: "moderate", complexity: "complex", budget: "moderate" }, traits: { aggression: 25, control: 50, comboAppetite: 28, interactionPref: 48, gameLengthPref: 62, budgetElasticity: 52 }, powerLevel: "Focused", budget: "Moderate", vibe: "blink etb value", limit: 6 } },
    { id: "lands", expectedTags: ["lands", "landfall", "big_mana"], request: { answers: { theme: "lands", pace: "value", interaction: "moderate", complexity: "medium", budget: "high" }, traits: { aggression: 40, control: 35, comboAppetite: 30, interactionPref: 35, gameLengthPref: 60, budgetElasticity: 75 }, powerLevel: "Focused", budget: "High", vibe: "landfall extra lands big mana", limit: 6 } },
  ];

  const tiers: TierMode[] = ["guest", "free", "pro"];
  const results: BenchmarkResult[] = [];

  for (const scenario of scenarios) {
    for (const tier of tiers) {
      const recs = await buildCommanderRecommendations(admin, { format: "Commander", ...scenario.request } as any, tierArgs(tier));
      const rows = await fetchTagGroundedRowsByNames(admin, recs.map((row) => row.name));
      const pass =
        recs.length >= 4 &&
        hasUniqueReasons(recs, 2) &&
        hasAnyTag(rows, scenario.expectedTags);
      results.push({
        id: `commander_${scenario.id}_${tier}`,
        group: "commander",
        route: "commander",
        passed: pass,
        message: pass ? "ok" : `Expected tags ${scenario.expectedTags.join(", ")} not found strongly enough`,
        sample: recs.slice(0, 4).map((row) => ({ name: row.name, fitReason: row.fitReason })),
      });
    }
  }

  return results;
}

async function runRouteBenchmarks(admin: SupabaseClient, decks: DeckSample[]): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const categories: CategoryKey[] = ["interaction", "card_draw", "win_condition"];
  const routeKinds: RecommendationRouteKind[] = ["cards", "deck", "swap", "finish"];

  for (let index = 0; index < Math.min(10, decks.length); index++) {
    const deck = decks[index];
    const names = deckTextToNames(deck.deck_text).slice(0, 99);
    const groundedRows = await fetchTagGroundedRowsByNames(admin, names);
    const profile = buildTagProfile(groundedRows);

    for (const routeKind of routeKinds) {
      const desiredCategory = routeKind === "finish" ? "win_condition" : undefined;
      const candidates = await fetchGroundedCandidatesForProfile(admin, {
        formatLabel: deck.format,
        topThemeTags: profile.topThemeTags,
        topGameplayTags: profile.topGameplayTags,
        topArchetypeTags: profile.topArchetypeTags,
        topCommanderTags: profile.topCommanderTags,
        commanderColors: deck.format.toLowerCase().includes("commander") ? profile.colorIdentity : undefined,
        excludeNames: names.map(norm),
        requireCommanderEligible: false,
        limitPerBucket: 40,
        desiredCategory,
      });
      const intent = buildRecommendationIntent({
        routeKind,
        routeLabel: `benchmark_${routeKind}`,
        formatLabel: deck.format,
        profile,
        desiredCategory,
        selectionCount: 4,
        isGuest: false,
        isPro: true,
        userId: "pro-benchmark-user",
      });
      const ranked = rankGroundedCandidates(candidates, profile, intent).slice(0, 16);
      const reranked = await aiRerankRecommendations({
        candidates: ranked,
        intent,
        userId: "pro-benchmark-user",
        isPro: true,
      });
      const pass =
        ranked.length >= 4 &&
        reranked.picks.length >= 3 &&
        hasUniqueReasons(reranked.picks, 2);
      results.push({
        id: `${routeKind}_deck_${index + 1}`,
        group: routeKind,
        route: routeKind,
        passed: pass,
        message: pass ? "ok" : "Insufficient ranked pool or repetitive reasons",
        sample: {
          deck: deck.title || deck.commander || deck.deck_id,
          picks: reranked.picks.slice(0, 4),
        },
      });
    }

    for (const category of categories) {
      const candidates = await fetchGroundedCandidatesForProfile(admin, {
        formatLabel: deck.format,
        topThemeTags: profile.topThemeTags,
        topGameplayTags: profile.topGameplayTags,
        topArchetypeTags: profile.topArchetypeTags,
        topCommanderTags: profile.topCommanderTags,
        commanderColors: deck.format.toLowerCase().includes("commander") ? profile.colorIdentity : undefined,
        excludeNames: names.map(norm),
        requireCommanderEligible: false,
        limitPerBucket: 40,
        desiredCategory: category,
      });
      const intent = buildRecommendationIntent({
        routeKind: category === "win_condition" ? "finish" : "health",
        routeLabel: `benchmark_${category}`,
        formatLabel: deck.format,
        profile,
        desiredCategory: category,
        selectionCount: 4,
        isGuest: false,
        isPro: true,
        userId: "pro-benchmark-user",
      });
      const ranked = rankGroundedCandidates(candidates, profile, intent).slice(0, 16);
      const reranked = await aiRerankRecommendations({
        candidates: ranked,
        intent,
        userId: "pro-benchmark-user",
        isPro: true,
      });
      const expectedTags =
        category === "interaction"
          ? ["interaction", "removal_single", "removal_boardwipe", "protection"]
          : category === "card_draw"
            ? ["card_draw", "draw_repeatable", "draw_burst", "engine"]
            : ["finisher", "payoff", "engine"];
      const pass =
        ranked.length >= 4 &&
        reranked.picks.length >= 3 &&
        hasAnyTag(ranked.slice(0, 6), expectedTags);
      results.push({
        id: `category_${category}_deck_${index + 1}`,
        group: "category",
        route: category,
        passed: pass,
        message: pass ? "ok" : `Expected category tags ${expectedTags.join(", ")} not found in top pool`,
        sample: {
          deck: deck.title || deck.commander || deck.deck_id,
          picks: reranked.picks.slice(0, 4),
        },
      });
    }
  }

  return results;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Missing Supabase env");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const decks = await fetchRealDeckSamples(admin, 10);
  if (decks.length < 8) throw new Error("Not enough real decks for benchmark suite");

  const commanderResults = await runCommanderBenchmarks(admin);
  const routeResults = await runRouteBenchmarks(admin, decks);
  const all = [...commanderResults, ...routeResults];

  const passed = all.filter((row) => row.passed);
  const failed = all.filter((row) => !row.passed);

  const summary = {
    ok: failed.length === 0,
    total: all.length,
    passed: passed.length,
    failed: failed.length,
    byGroup: Object.fromEntries(
      unique(all.map((row) => row.group)).map((group) => [
        group,
        {
          total: all.filter((row) => row.group === group).length,
          failed: all.filter((row) => row.group === group && !row.passed).length,
        },
      ]),
    ),
    failedCases: failed,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2));
  process.exit(1);
});
