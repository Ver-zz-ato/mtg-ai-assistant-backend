import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { buildCommanderRecommendations } from "@/lib/recommendations/commander-recommender";
import { buildTagProfile, fetchGroundedCandidatesForProfile, fetchTagGroundedRowsByNames } from "@/lib/recommendations/tag-grounding";
import { aiRerankRecommendations, buildRecommendationIntent, rankGroundedCandidates } from "@/lib/recommendations/recommendation-pipeline";

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

function assertThat(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function summarizePicks(picks: Array<{ name: string; reason: string }>) {
  return picks.map((pick) => ({ name: pick.name, reason: pick.reason }));
}

function anyTagHit(rows: Array<{ theme_tags?: string[] | null; gameplay_tags?: string[] | null; archetype_tags?: string[] | null; commander_tags?: string[] | null }>, tags: string[]) {
  const wanted = new Set(tags);
  return rows.some((row) =>
    [...(row.theme_tags ?? []), ...(row.gameplay_tags ?? []), ...(row.archetype_tags ?? []), ...(row.commander_tags ?? [])].some((tag) => wanted.has(tag)),
  );
}

loadDotEnv(".env.local");
loadDotEnv(".env");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Missing Supabase env");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const scenarios = [
    {
      id: "tokens",
      request: {
        format: "Commander",
        answers: { theme: "tokens", pace: "aggro", interaction: "moderate", complexity: "simple", budget: "budget" },
        traits: { aggression: 75, control: 25, comboAppetite: 20, interactionPref: 45, gameLengthPref: 40, budgetElasticity: 25 },
        powerLevel: "Casual",
        budget: "Budget",
        vibe: "tokens go wide creature tokens",
        limit: 6,
      },
      expected: ["token", "go-wide", "go wide", "swarm"],
    },
    {
      id: "graveyard",
      request: {
        format: "Commander",
        answers: { theme: "graveyard", pace: "value", interaction: "heavy", complexity: "complex", budget: "moderate" },
        traits: { aggression: 20, control: 70, comboAppetite: 55, interactionPref: 80, gameLengthPref: 70, budgetElasticity: 55 },
        powerLevel: "Focused",
        budget: "Moderate",
        vibe: "graveyard recursion reanimator",
        limit: 6,
      },
      expected: ["graveyard", "recursion", "reanimator", "sacrifice"],
    },
    {
      id: "spellslinger",
      request: {
        format: "Commander",
        answers: { theme: "spells", pace: "combo", interaction: "heavy", complexity: "complex", budget: "high" },
        traits: { aggression: 35, control: 60, comboAppetite: 85, interactionPref: 70, gameLengthPref: 50, budgetElasticity: 80 },
        powerLevel: "Optimized",
        budget: "High",
        vibe: "spellslinger storm copy spells",
        limit: 6,
      },
      expected: ["spell", "spellslinger", "instant", "sorcery", "storm"],
    },
  ];

  const outputs = [];
  for (const scenario of scenarios) {
    const guest = await buildCommanderRecommendations(admin, scenario.request as any, { isGuest: true, isPro: false, userId: null });
    const free = await buildCommanderRecommendations(admin, scenario.request as any, { isGuest: false, isPro: false, userId: "free-user" });
    const pro = await buildCommanderRecommendations(admin, scenario.request as any, { isGuest: false, isPro: true, userId: "pro-user" });
    const blob = JSON.stringify(pro).toLowerCase();
    assertThat(
      scenario.expected.some((needle) => blob.includes(needle)),
      `${scenario.id}: pro output is not grounded in expected theme words -> ${JSON.stringify(pro.map((row) => ({ name: row.name, fitReason: row.fitReason })))}`,
    );
    assertThat(
      new Set(pro.map((row) => row.fitReason)).size >= 2,
      `${scenario.id}: pro fit reasons are too repetitive -> ${JSON.stringify(pro.map((row) => ({ name: row.name, fitReason: row.fitReason })))}`,
    );
    outputs.push({
      scenario: scenario.id,
      guest: guest.slice(0, 3).map((row) => row.name),
      free: free.slice(0, 4).map((row) => row.name),
      pro: pro.slice(0, 6).map((row) => row.name),
    });
  }

  const sampleDeckRows = await fetchTagGroundedRowsByNames(admin, [
    "Pitiless Plunderer",
    "Skullclamp",
    "Chatterfang, Squirrel General",
    "Nested Shambler",
    "Moldervine Reclamation",
  ]);
  const profile = buildTagProfile(sampleDeckRows);
  const deckCandidates = await fetchGroundedCandidatesForProfile(admin, {
    formatLabel: "Commander",
    topThemeTags: profile.topThemeTags,
    topGameplayTags: profile.topGameplayTags,
    topArchetypeTags: profile.topArchetypeTags,
    topCommanderTags: profile.topCommanderTags,
    requireCommanderEligible: false,
    limitPerBucket: 32,
  });
  const intent = buildRecommendationIntent({
    routeKind: "finish",
    routeLabel: "local_finish_verifier",
    formatLabel: "Commander",
    profile,
    desiredCategory: "win_condition",
    selectionCount: 5,
    isGuest: false,
    isPro: true,
    userId: "pro-user",
  });
  const ranked = rankGroundedCandidates(deckCandidates, profile, intent).slice(0, 20);
  assertThat(ranked.length >= 5, "local finish deterministic pool should surface enough candidates");

  const sharedRouteChecks: Array<{ route: string; picks: Array<{ name: string; reason: string }> }> = [];
  const sharedScenarios = [
    {
      routeKind: "cards" as const,
      routeLabel: "local_cards_verifier",
      selectionCount: 4,
      expectedTags: ["tokens", "go_wide", "payoff"],
    },
    {
      routeKind: "deck" as const,
      routeLabel: "local_deck_verifier",
      selectionCount: 4,
      expectedTags: ["tokens", "engine", "payoff"],
    },
    {
      routeKind: "health" as const,
      routeLabel: "local_health_verifier",
      selectionCount: 4,
      desiredCategory: "interaction" as const,
      expectedTags: ["interaction", "removal_single", "removal_boardwipe", "protection"],
    },
    {
      routeKind: "swap" as const,
      routeLabel: "local_swap_verifier",
      selectionCount: 4,
      expectedTags: ["tokens", "engine", "payoff"],
    },
    {
      routeKind: "finish" as const,
      routeLabel: "local_finish_verifier",
      selectionCount: 4,
      desiredCategory: "win_condition" as const,
      expectedTags: ["finisher", "payoff", "aggro", "value"],
    },
  ];

  for (const scenario of sharedScenarios) {
    const scenarioCandidates = await fetchGroundedCandidatesForProfile(admin, {
      formatLabel: "Commander",
      topThemeTags: profile.topThemeTags,
      topGameplayTags: profile.topGameplayTags,
      topArchetypeTags: profile.topArchetypeTags,
      topCommanderTags: profile.topCommanderTags,
      requireCommanderEligible: false,
      limitPerBucket: 40,
      desiredCategory: scenario.desiredCategory,
    });
    const scenarioIntent = buildRecommendationIntent({
      routeKind: scenario.routeKind,
      routeLabel: scenario.routeLabel,
      formatLabel: "Commander",
      profile,
      desiredCategory: scenario.desiredCategory,
      selectionCount: scenario.selectionCount,
      isGuest: false,
      isPro: true,
      userId: "pro-user",
    });
    const scenarioRanked = rankGroundedCandidates(scenarioCandidates, profile, scenarioIntent).slice(0, 16);
    assertThat(scenarioRanked.length >= Math.min(4, scenario.selectionCount), `${scenario.routeKind}: not enough ranked candidates`);
    assertThat(anyTagHit(scenarioRanked.slice(0, 6), scenario.expectedTags), `${scenario.routeKind}: top candidates are missing expected grounded tags`);
    const reranked = await aiRerankRecommendations({
      candidates: scenarioRanked,
      intent: scenarioIntent,
      userId: "pro-user",
      isPro: true,
    });
    assertThat(reranked.picks.length >= 3, `${scenario.routeKind}: reranker returned too few picks`);
    sharedRouteChecks.push({
      route: scenario.routeKind,
      picks: summarizePicks(reranked.picks),
    });
  }

  console.log(JSON.stringify({
    ok: true,
    outputs,
    sharedRouteChecks,
    finishPreview: ranked.slice(0, 5).map((row) => ({ name: row.printed_name || row.name, reason: row.groundedReason })),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2));
  process.exit(1);
});
