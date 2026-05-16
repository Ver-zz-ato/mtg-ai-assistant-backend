import type { GroundedCardCandidate, TagProfile, CategoryKey } from "@/lib/recommendations/tag-grounding";
import { buildGroundedReason, scoreCandidateAgainstProfile } from "@/lib/recommendations/tag-grounding";
import { callLLM } from "@/lib/ai/unified-llm-client";
import { formatTierCapabilityPrompt, resolveManaTapTier } from "@/lib/ai/tier-policy";
import { getRecommendationTierConfig, type RecommendationTier } from "@/lib/recommendations/recommendation-tier";

export type RecommendationRouteKind =
  | "commander"
  | "cards"
  | "deck"
  | "health"
  | "swap"
  | "finish";

export type RecommendationRejectionReason =
  | "weak_theme_evidence"
  | "wrong_role"
  | "generic_goodstuff"
  | "wrong_power_band"
  | "wrong_budget_band"
  | "low_tag_overlap";

export type RecommendationIntent = {
  routeKind: RecommendationRouteKind;
  formatLabel: string;
  routeLabel: string;
  topThemeTags: string[];
  topGameplayTags: string[];
  topArchetypeTags: string[];
  topCommanderTags: string[];
  desiredCategory?: CategoryKey;
  profileSummary: string;
  commanderColors?: string[];
  selectionCount: number;
  tier: RecommendationTier;
  budgetBand?: string | null;
  powerBand?: string | null;
  queryText?: string | null;
};

export type RecommendationScoreBreakdown = {
  total: number;
  themeFit: number;
  roleFit: number;
  archetypeFit: number;
  powerFit: number;
  budgetFit: number;
  formatFit: number;
  diversityPenalty: number;
  genericPenalty: number;
};

export type RankedGroundedCandidate = GroundedCardCandidate & {
  scoreBreakdown: RecommendationScoreBreakdown;
  rejectionReasons: RecommendationRejectionReason[];
  groundedReason: string;
};

export type RecommendationRerankResult = {
  picks: Array<{ name: string; reason: string }>;
  fallbackUsed: boolean;
  model: string;
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizeTags(tags: string[] | null | undefined): string[] {
  return Array.isArray(tags) ? tags.filter(Boolean) : [];
}

const GENERIC_THEME_TAGS = new Set(["legendary_matters"]);
const GENERIC_COMMANDER_TAGS = new Set([
  "build_around_commander",
  "goodstuff_commander",
  "linear_commander",
  "open_ended_commander",
]);

const HARD_THEME_PATTERNS: Partial<Record<string, RegExp>> = {
  tokens: /\bcreature token\b|\bcreate .* token\b|\bpopulate\b|\bamass\b|\bincubate\b/i,
  graveyard: /\bgraveyard\b|\breturn target .* from your graveyard\b|\bcast .* from your graveyard\b|\bmill\b|\bsurveil\b/i,
  spellslinger: /\binstant or sorcery\b|\bcopy target spell\b|\binstant and sorcery spells you cast cost\b|\bwhenever you cast (?:an )?instant or sorcery\b|\bstorm\b/i,
  artifacts: /\bartifact\b|\btreasure token\b|\bclue token\b|\bfood token\b|\bblood token\b/i,
  enchantments: /\benchantment\b|\baura\b|\bconstellation\b/i,
  tribal: /\bdragon\b|\belf\b|\bzombie\b|\bgoblin\b|\bvampire\b|\bmerfolk\b|\bsliver\b/i,
  blink: /\bexile\b.{0,60}\breturn\b.{0,60}\bto the battlefield\b|\benters the battlefield\b/i,
};

const TOKEN_PAYOFF_PATTERN = /\bcreatures? you control\b|\bfor each creature you control\b|\battacking creatures?\b|\bother tokens? you control\b/i;
const TREASURE_ONLY_PATTERN = /\btreasure token\b|\bclue token\b|\bfood token\b|\bblood token\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildThemeHaystack(candidate: GroundedCardCandidate): string {
  const selfNames = [String(candidate.printed_name || ""), String(candidate.name || "")]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  let oracle = String(candidate.oracle_text || "").toLowerCase();
  for (const selfName of selfNames) {
    oracle = oracle.replace(new RegExp(`\\b${escapeRegExp(selfName)}\\b`, "gi"), "this card");
  }
  const typeLine = String(candidate.type_line || "").toLowerCase();
  return `${oracle} ${typeLine}`;
}

function strongThemeSignal(candidate: GroundedCardCandidate, theme: string): boolean {
  const haystack = buildThemeHaystack(candidate);
  const themeTags = new Set(normalizeTags(candidate.theme_tags));
  const gameplayTags = new Set(normalizeTags(candidate.gameplay_tags));
  const commanderTags = new Set(normalizeTags(candidate.commander_tags));

  if (theme === "tokens") {
    const hasCreatureTokenEvidence = /\bcreature token\b|\bcreate .* creature token\b|\bpopulate\b|\bamass\b|\bincubate\b/i.test(haystack);
    const hasTokenPayoff = TOKEN_PAYOFF_PATTERN.test(haystack) && (commanderTags.has("go_wide") || gameplayTags.has("payoff"));
    const isTreasureOnly = TREASURE_ONLY_PATTERN.test(haystack) && !hasCreatureTokenEvidence;
    return !isTreasureOnly && (hasCreatureTokenEvidence || hasTokenPayoff || (themeTags.has("tokens") && commanderTags.has("go_wide")));
  }
  if (theme === "graveyard" || theme === "reanimator") {
    const hasRealGraveyardText = /\bgraveyard\b|\breturn target .* from your graveyard\b|\bcast .* from your graveyard\b|\bmill\b|\bsurveil\b/i.test(haystack);
    const hasRecursionPlan = gameplayTags.has("recursion") || themeTags.has("reanimator") || themeTags.has("self_mill");
    return hasRealGraveyardText && (themeTags.has("graveyard") || hasRecursionPlan);
  }
  if (theme === "spellslinger") {
    const hasRealSpellText = /\binstant or sorcery\b|\bcopy target spell\b|\binstant and sorcery spells you cast cost\b|\bwhenever you cast (?:an )?instant or sorcery\b|\bstorm\b/i.test(haystack);
    return hasRealSpellText && (themeTags.has("spellslinger") || commanderTags.has("spell_combo") || gameplayTags.has("card_draw"));
  }
  if (theme === "artifacts") {
    return (/\bartifact\b/i.test(haystack) || /\btreasure token\b/i.test(haystack)) && themeTags.has("artifacts");
  }
  if (theme === "enchantments") {
    return /\benchantment\b|\baura\b|\bconstellation\b/i.test(haystack) && themeTags.has("enchantments");
  }
  if (theme === "tribal") {
    return /\bdragon\b|\belf\b|\bzombie\b|\bgoblin\b|\bvampire\b|\bmerfolk\b|\bsliver\b/i.test(haystack) &&
      (themeTags.has("tribal") || commanderTags.has("tribal_commander"));
  }
  if (theme === "blink") {
    return /\bexile\b.{0,60}\breturn\b.{0,60}\bto the battlefield\b|\benters the battlefield\b/i.test(haystack) &&
      (themeTags.has("blink") || themeTags.has("etb"));
  }
  return true;
}

const GENERIC_GOODSTUFF_NAMES = new Set([
  "sol ring",
  "arcane signet",
  "rhystic study",
  "cyclonic rift",
  "smothering tithe",
  "demonic tutor",
  "dockside extortionist",
]);

export function buildRecommendationIntent(input: {
  routeKind: RecommendationRouteKind;
  formatLabel: string;
  profile: TagProfile;
  desiredCategory?: CategoryKey;
  commanderColors?: string[];
  selectionCount?: number;
  isGuest?: boolean | null;
  isPro?: boolean | null;
  userId?: string | null;
  routeLabel?: string;
  queryText?: string | null;
  budgetBand?: string | null;
  powerBand?: string | null;
}): RecommendationIntent {
  const tier = resolveManaTapTier({
    isGuest: input.isGuest,
    isPro: input.isPro,
    userId: input.userId,
  });
  return {
    routeKind: input.routeKind,
    formatLabel: input.formatLabel,
    routeLabel: input.routeLabel ?? input.routeKind,
    topThemeTags: input.profile.topThemeTags,
    topGameplayTags: input.profile.topGameplayTags,
    topArchetypeTags: input.profile.topArchetypeTags,
    topCommanderTags: input.profile.topCommanderTags,
    desiredCategory: input.desiredCategory,
    profileSummary: input.profile.profileSummary,
    commanderColors: input.commanderColors,
    selectionCount: Math.max(3, Math.min(input.selectionCount ?? 6, 12)),
    tier,
    budgetBand: input.budgetBand ?? null,
    powerBand: input.powerBand ?? null,
    queryText: input.queryText ?? null,
  };
}

function routeNeedsCommanderStrictness(routeKind: RecommendationRouteKind): boolean {
  return routeKind === "commander";
}

function candidateMatchesHardTheme(candidate: GroundedCardCandidate, theme: string): boolean {
  const tags = new Set([...normalizeTags(candidate.theme_tags), ...normalizeTags(candidate.commander_tags), ...normalizeTags(candidate.gameplay_tags)]);

  if (theme === "tokens") {
    return strongThemeSignal(candidate, theme);
  }
  if (theme === "graveyard" || theme === "reanimator") {
    return strongThemeSignal(candidate, theme);
  }
  if (theme === "spellslinger") {
    return strongThemeSignal(candidate, theme);
  }
  if (theme === "artifacts") return strongThemeSignal(candidate, theme);
  if (theme === "enchantments") return strongThemeSignal(candidate, theme);
  if (theme === "tribal") return strongThemeSignal(candidate, theme);
  if (theme === "blink") return strongThemeSignal(candidate, theme);
  return true;
}

function detectRejectionReasons(candidate: GroundedCardCandidate, intent: RecommendationIntent, baseScore: number): RecommendationRejectionReason[] {
  const reasons: RecommendationRejectionReason[] = [];
  const themeTags = normalizeTags(candidate.theme_tags);
  const gameplayTags = normalizeTags(candidate.gameplay_tags);
  const archetypeTags = normalizeTags(candidate.archetype_tags);
  const commanderTags = normalizeTags(candidate.commander_tags);
  const topTheme = intent.topThemeTags[0];

  if (topTheme && !candidateMatchesHardTheme(candidate, topTheme)) reasons.push("weak_theme_evidence");
  if (intent.desiredCategory === "interaction" && !gameplayTags.some((tag) => ["interaction", "removal", "removal_single", "removal_boardwipe", "protection"].includes(tag))) {
    reasons.push("wrong_role");
  }
  if (intent.desiredCategory === "card_draw" && !gameplayTags.some((tag) => ["card_draw", "draw_repeatable", "draw_burst", "engine"].includes(tag))) {
    reasons.push("wrong_role");
  }
  if (intent.desiredCategory === "win_condition" && !gameplayTags.some((tag) => ["finisher", "payoff"].includes(tag))) {
    reasons.push("wrong_role");
  }
  if (
    GENERIC_GOODSTUFF_NAMES.has(String(candidate.name || "").toLowerCase()) ||
    (themeTags.every((tag) => GENERIC_THEME_TAGS.has(tag)) && commanderTags.every((tag) => GENERIC_COMMANDER_TAGS.has(tag)))
  ) {
    reasons.push("generic_goodstuff");
  }
  const overlapCount =
    themeTags.filter((tag) => intent.topThemeTags.includes(tag)).length +
    gameplayTags.filter((tag) => intent.topGameplayTags.includes(tag)).length +
    archetypeTags.filter((tag) => intent.topArchetypeTags.includes(tag)).length;
  if (overlapCount === 0 && baseScore < 15) reasons.push("low_tag_overlap");
  return unique(reasons);
}

export function scoreRecommendationCandidate(
  candidate: GroundedCardCandidate,
  profile: TagProfile,
  intent: RecommendationIntent,
  options?: { diversityIndex?: number },
): RecommendationScoreBreakdown {
  const themeFit = normalizeTags(candidate.theme_tags).reduce((sum, tag) => sum + (intent.topThemeTags.includes(tag) ? 18 : 0), 0);
  const roleFit = normalizeTags(candidate.gameplay_tags).reduce((sum, tag) => sum + (intent.topGameplayTags.includes(tag) ? 12 : 0), 0);
  const archetypeFit = normalizeTags(candidate.archetype_tags).reduce((sum, tag) => sum + (intent.topArchetypeTags.includes(tag) ? 10 : 0), 0);
  const powerFit = intent.powerBand && candidate.commander_power_band === intent.powerBand ? 8 : 0;
  const budgetFit = intent.budgetBand && candidate.commander_budget_band === intent.budgetBand ? 8 : 0;
  const formatFit = routeNeedsCommanderStrictness(intent.routeKind) && candidate.commander_eligible ? 8 : 4;
  let diversityPenalty = 0;
  if ((options?.diversityIndex ?? 0) > 0 && normalizeTags(candidate.theme_tags)[0] === intent.topThemeTags[0]) {
    diversityPenalty -= Math.min(6, (options?.diversityIndex ?? 0) * 2);
  }
  let genericPenalty = 0;
  if (GENERIC_GOODSTUFF_NAMES.has(String(candidate.name || "").toLowerCase())) genericPenalty -= 12;
  if (intent.topThemeTags[0] && !candidateMatchesHardTheme(candidate, intent.topThemeTags[0])) genericPenalty -= 24;
  if (intent.desiredCategory === "interaction" && !normalizeTags(candidate.gameplay_tags).some((tag) => ["interaction", "removal", "removal_single", "removal_boardwipe", "protection"].includes(tag))) genericPenalty -= 16;
  if (intent.desiredCategory === "card_draw" && !normalizeTags(candidate.gameplay_tags).some((tag) => ["card_draw", "draw_repeatable", "draw_burst", "engine"].includes(tag))) genericPenalty -= 16;
  if (intent.desiredCategory === "win_condition" && !normalizeTags(candidate.gameplay_tags).some((tag) => ["finisher", "payoff"].includes(tag))) genericPenalty -= 14;

  const total = themeFit + roleFit + archetypeFit + powerFit + budgetFit + formatFit + diversityPenalty + genericPenalty + Math.round((candidate.popularity_score ?? 0) * 6);

  return {
    total,
    themeFit,
    roleFit,
    archetypeFit,
    powerFit,
    budgetFit,
    formatFit,
    diversityPenalty,
    genericPenalty,
  };
}

export function rankGroundedCandidates(
  candidates: GroundedCardCandidate[],
  profile: TagProfile,
  intent: RecommendationIntent,
): RankedGroundedCandidate[] {
  const scored = candidates
    .map((candidate, index) => {
      const scoreBreakdown = scoreRecommendationCandidate(candidate, profile, intent, { diversityIndex: index % 3 });
      const fallbackReason = buildGroundedReason(candidate, profile, { desiredCategory: intent.desiredCategory });
      return {
        ...candidate,
        scoreBreakdown,
        groundedReason: fallbackReason,
        rejectionReasons: detectRejectionReasons(candidate, intent, scoreBreakdown.total),
      };
    })
    .filter((candidate) => !candidate.rejectionReasons.includes("weak_theme_evidence"))
    .sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total || String(a.name).localeCompare(String(b.name)));

  return scored;
}

function candidateSummaryLines(candidates: RankedGroundedCandidate[]): string {
  return candidates
    .map((candidate, index) => {
      const theme = normalizeTags(candidate.theme_tags).slice(0, 3).join(", ");
      const gameplay = normalizeTags(candidate.gameplay_tags).slice(0, 3).join(", ");
      const archetype = normalizeTags(candidate.archetype_tags).slice(0, 2).join(", ");
      return `${index + 1}. ${candidate.printed_name || candidate.name} | theme=${theme || "none"} | role=${gameplay || "none"} | archetype=${archetype || "none"} | draft_reason=${candidate.groundedReason}`;
    })
    .join("\n");
}

async function runJudgePass(args: {
  candidates: RankedGroundedCandidate[];
  intent: RecommendationIntent;
  tier: RecommendationTier;
  userId?: string | null;
  isPro?: boolean;
  pickCount: number;
  passLabel: string;
  promptContext: string;
}): Promise<Array<{ name: string; reason: string }>> {
  const tierConfig = getRecommendationTierConfig(args.tier);
  const capabilityPrompt = formatTierCapabilityPrompt({
    ...{
      tier: args.tier,
      persistMemory: false,
      deckMutations: true,
      maxToolResults: 0,
      maxProtectedCards: 0,
      maxCombos: 0,
      includeCollectionFit: "none",
      includePowerProfile: false,
      includeDurableMemories: false,
      includeRulesGrounding: "basic",
      includePriceHistory: false,
      includeProbability: false,
      recommendationStrictness: args.tier === "pro" ? "strict" : args.tier === "free" ? "guarded" : "basic",
    },
  });
  const system = [
    "You are ManaTap AI selecting the best recommendation candidates from a prevalidated legal pool.",
    "You must choose only from the provided candidates. Never invent a new card or commander.",
    `Return strict JSON: {\"picks\":[{\"name\":\"Exact Candidate Name\",\"reason\":\"Short reason\"}]}.`,
    `Pick exactly ${args.pickCount} items unless fewer valid candidates exist.`,
    "Prefer theme-fit and role-fit over generic goodstuff.",
    "Avoid repetitive reasons and avoid repeating the same idea across every pick.",
    capabilityPrompt,
  ].join("\n");
  const user = [
    `Route: ${args.intent.routeLabel}`,
    `Format: ${args.intent.formatLabel}`,
    `Intent summary: ${args.intent.profileSummary || "No summary"}`,
    args.intent.queryText ? `User vibe: ${args.intent.queryText}` : "",
    args.promptContext,
    "Candidates:",
    candidateSummaryLines(args.candidates),
  ].filter(Boolean).join("\n\n");

  const response = await callLLM(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      route: `/internal/recommendations/${args.intent.routeKind}/${args.passLabel}`,
      feature: "deck_scan",
      model: tierConfig.model,
      fallbackModel: tierConfig.fallbackModel,
      timeout: tierConfig.latencyBudgetMs,
      maxTokens: 1200,
      apiType: "chat",
      userId: args.userId ?? null,
      isPro: !!args.isPro,
      user_tier: args.tier,
      source: "recommendation_reranker",
      jsonResponse: true,
      skipRecordAiUsage: true,
    },
  );

  try {
    const parsed = JSON.parse(response.text || "{}") as { picks?: Array<{ name?: string; reason?: string }> };
    const allowed = new Set(args.candidates.map((candidate) => String(candidate.printed_name || candidate.name)));
    return (parsed.picks ?? [])
      .filter((pick) => pick?.name && allowed.has(String(pick.name)))
      .map((pick) => ({
        name: String(pick.name),
        reason: String(pick.reason || "").trim() || "Strong on-plan fit.",
      }))
      .slice(0, args.pickCount);
  } catch {
    return [];
  }
}

export async function aiRerankRecommendations(args: {
  candidates: RankedGroundedCandidate[];
  intent: RecommendationIntent;
  userId?: string | null;
  isPro?: boolean;
}): Promise<RecommendationRerankResult> {
  const tierConfig = getRecommendationTierConfig(args.intent.tier);
  const candidatePool = args.candidates.slice(0, tierConfig.candidateLimit);
  const pickCount = Math.min(args.intent.selectionCount, tierConfig.maxSelections, candidatePool.length);
  const deterministicWindow = candidatePool.slice(0, Math.min(candidatePool.length, Math.max(pickCount * 2, args.intent.routeKind === "commander" ? 10 : 8)));
  const deterministicNameSet = new Set(deterministicWindow.map((candidate) => String(candidate.printed_name || candidate.name)));
  if (candidatePool.length === 0 || pickCount === 0) {
    return { picks: [], fallbackUsed: true, model: tierConfig.model };
  }

  const judgePicks = await runJudgePass({
    candidates: candidatePool,
    intent: args.intent,
    tier: args.intent.tier,
    userId: args.userId,
    isPro: args.isPro,
    pickCount,
    passLabel: "judge",
    promptContext: "Choose the strongest candidates for this user intent.",
  }).catch(() => []);

  const validatedJudgePicks = judgePicks.filter((pick) => deterministicNameSet.has(pick.name));

  if (tierConfig.judgePasses === 1 || validatedJudgePicks.length === 0) {
    return {
      picks: validatedJudgePicks.length ? validatedJudgePicks : deterministicWindow.slice(0, pickCount).map((candidate) => ({
        name: String(candidate.printed_name || candidate.name),
        reason: candidate.groundedReason,
      })),
      fallbackUsed: validatedJudgePicks.length === 0,
      model: tierConfig.model,
    };
  }

  const shortlisted = candidatePool.filter((candidate) =>
    validatedJudgePicks.some((pick) => pick.name === String(candidate.printed_name || candidate.name)),
  );

  const writerPicks = await runJudgePass({
    candidates: shortlisted.length ? shortlisted : candidatePool.slice(0, pickCount),
    intent: args.intent,
    tier: args.intent.tier,
    userId: args.userId,
    isPro: args.isPro,
    pickCount,
    passLabel: "writer",
    promptContext: "Rewrite the final reasons so they are short, specific, and non-repetitive.",
  }).catch(() => []);

  const validatedWriterPicks = writerPicks.filter((pick) => deterministicNameSet.has(pick.name));
  let finalPicks = validatedWriterPicks.length ? validatedWriterPicks : validatedJudgePicks;

  if (tierConfig.useCriticPass && finalPicks.length > 1) {
    const uniqueReasonCount = new Set(finalPicks.map((pick) => pick.reason)).size;
    if (uniqueReasonCount < Math.max(2, Math.floor(finalPicks.length / 2))) {
      finalPicks = finalPicks.map((pick, index) => ({
        ...pick,
        reason:
          shortlisted[index]?.groundedReason ||
          candidatePool[index]?.groundedReason ||
          pick.reason,
      }));
    }
  }

  if (!finalPicks.length) {
    finalPicks = deterministicWindow.slice(0, pickCount).map((candidate) => ({
      name: String(candidate.printed_name || candidate.name),
      reason: candidate.groundedReason,
    }));
  }

  const candidateByName = new Map(
    candidatePool.map((candidate) => [String(candidate.printed_name || candidate.name), candidate]),
  );
  const seenReasons = new Set<string>();
  finalPicks = finalPicks.map((pick, index) => {
    const normalizedReason = pick.reason.trim().toLowerCase();
    if (!normalizedReason || seenReasons.has(normalizedReason)) {
      const grounded = candidateByName.get(pick.name);
      const fallbackReason = grounded?.groundedReason || `Fits the ${args.intent.routeLabel.replace(/_/g, " ")} plan cleanly.`;
      const uniqueReason = index === 0 ? fallbackReason : `${fallbackReason} Pick ${index + 1} keeps a different angle on the same plan.`;
      seenReasons.add(uniqueReason.toLowerCase());
      return { ...pick, reason: uniqueReason };
    }
    seenReasons.add(normalizedReason);
    return pick;
  });

  const finalPickNames = new Set(finalPicks.map((pick) => pick.name));
  for (const candidate of deterministicWindow) {
    const displayName = String(candidate.printed_name || candidate.name);
    if (finalPicks.length >= pickCount) break;
    if (finalPickNames.has(displayName)) continue;
    finalPicks.push({
      name: displayName,
      reason: candidate.groundedReason,
    });
    finalPickNames.add(displayName);
  }

  return {
    picks: finalPicks.slice(0, pickCount),
    fallbackUsed: validatedWriterPicks.length === 0,
    model: tierConfig.model,
  };
}
