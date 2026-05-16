import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGroundedCandidatesForProfile, type GroundedCardCandidate, type TagProfile } from "@/lib/recommendations/tag-grounding";
import { aiRerankRecommendations, buildRecommendationIntent, rankGroundedCandidates, type RecommendationIntent, type RankedGroundedCandidate } from "@/lib/recommendations/recommendation-pipeline";
import { fetchCard } from "@/lib/deck/inference";
import { getFormatRules, type DeckFormatCanonical, normalizeDeckFormat } from "@/lib/deck/formatRules";

export type ScaffoldIntent = {
  colors: string[];
  format: string;
  title: string;
  mustInclude: string[];
  archetype: string | null;
  theme: string | null;
  vibe: string | null;
  commander: string | null;
  budget: string | null;
  power: string | null;
  plan: string;
};

export type ScaffoldDeckResult = {
  title: string;
  format: string;
  plan: string;
  colors: string[];
  commander: string | null;
  overallAim: string;
  decklist: Array<{ name: string; qty: number }>;
  deckText: string;
};

type SlotPlan = {
  lands: number;
  ramp: number;
  draw: number;
  interaction: number;
  finishers: number;
  anchors: number;
  utility: number;
};

const COLOR_TO_BASIC: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

const THEME_MAP: Record<string, { theme: string[]; gameplay: string[]; archetype: string[]; commander: string[] }> = {
  tokens: { theme: ["tokens"], gameplay: ["payoff", "engine"], archetype: ["aggro", "value"], commander: ["go_wide"] },
  graveyard: { theme: ["graveyard", "reanimator"], gameplay: ["recursion", "engine"], archetype: ["value", "combo"], commander: ["aristocrats"] },
  spellslinger: { theme: ["spellslinger"], gameplay: ["card_draw", "engine"], archetype: ["combo", "control"], commander: ["spell_combo"] },
  artifacts: { theme: ["artifacts"], gameplay: ["engine", "payoff"], archetype: ["value", "combo"], commander: ["build_around_commander"] },
  enchantments: { theme: ["enchantments"], gameplay: ["engine", "payoff"], archetype: ["value", "control"], commander: ["build_around_commander"] },
  tribal: { theme: ["tribal"], gameplay: ["payoff"], archetype: ["aggro", "midrange"], commander: ["tribal_commander"] },
  blink: { theme: ["blink", "etb"], gameplay: ["engine", "card_draw"], archetype: ["value", "midrange"], commander: ["build_around_commander"] },
  lands: { theme: ["lands", "landfall"], gameplay: ["ramp", "engine"], archetype: ["value", "midrange"], commander: ["big_mana"] },
};

function inferBudgetBand(input: string | null): string | null {
  const raw = String(input || "").toLowerCase();
  if (!raw) return null;
  if (/budget|cheap|low|under/.test(raw)) return "budget";
  if (/high|premium|expensive/.test(raw)) return "high";
  return "moderate";
}

function inferPowerBand(input: string | null): string | null {
  const raw = String(input || "").toLowerCase();
  if (!raw) return null;
  if (/casual|low|chill/.test(raw)) return "casual";
  if (/high|cedh|optimized|tuned/.test(raw)) return "optimized";
  return "focused";
}

function canonicalizeColors(input: string[]): string[] {
  return [...new Set((input || []).map((value) => String(value || "").trim().toUpperCase()).filter((value) => "WUBRG".includes(value)))];
}

function pickThemeBundle(intent: ScaffoldIntent): { theme: string[]; gameplay: string[]; archetype: string[]; commander: string[] } {
  const haystack = [intent.archetype, intent.theme, intent.vibe, intent.plan].filter(Boolean).join(" ").toLowerCase();
  for (const [key, bundle] of Object.entries(THEME_MAP)) {
    if (haystack.includes(key) || (key === "spellslinger" && /\bspells?\b/.test(haystack))) return bundle;
  }
  return { theme: [], gameplay: ["engine", "payoff"], archetype: ["midrange"], commander: ["build_around_commander"] };
}

function buildManualProfile(intent: ScaffoldIntent): TagProfile {
  const bundle = pickThemeBundle(intent);
  const summary = [bundle.theme[0], bundle.archetype[0], intent.power || "", intent.budget || ""].filter(Boolean).join(" | ");
  return {
    topThemeTags: bundle.theme,
    topGameplayTags: bundle.gameplay,
    topArchetypeTags: bundle.archetype,
    topCommanderTags: bundle.commander,
    colorIdentity: canonicalizeColors(intent.colors),
    profileSummary: summary || "grounded scaffold profile",
    counts: {
      theme: new Map(bundle.theme.map((tag, index) => [tag, bundle.theme.length - index])),
      gameplay: new Map(bundle.gameplay.map((tag, index) => [tag, bundle.gameplay.length - index])),
      archetype: new Map(bundle.archetype.map((tag, index) => [tag, bundle.archetype.length - index])),
      commander: new Map(bundle.commander.map((tag, index) => [tag, bundle.commander.length - index])),
    },
  };
}

function buildSlotPlan(format: DeckFormatCanonical): SlotPlan {
  if (format === "commander") {
    return { lands: 36, ramp: 10, draw: 8, interaction: 10, finishers: 6, anchors: 16, utility: 13 };
  }
  return { lands: 24, ramp: 6, draw: 6, interaction: 8, finishers: 6, anchors: 8, utility: 8 };
}

function toDisplayName(name: string): string {
  const minorWords = new Set(["a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with"]);
  const capitalizeToken = (token: string, force: boolean): string => {
    const lower = token.toLowerCase();
    if (!force && minorWords.has(lower)) return lower;
    return lower.replace(/(^|['-])([a-z])/g, (_match, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
  };
  return String(name || "")
    .split(" // ")
    .map((face) => face.split(/\s+/).filter(Boolean).map((token, index) => capitalizeToken(token, index === 0)).join(" "))
    .join(" // ");
}

function budgetMaxPrice(intent: ScaffoldIntent): number | null {
  const raw = String(intent.budget || "").toLowerCase();
  if (!raw) return null;
  if (raw.includes("budget")) return 8;
  if (raw.includes("moderate")) return 20;
  return 45;
}

function scaffoldCandidateDisplayName(candidate: GroundedCardCandidate): string {
  return String(candidate.printed_name || "").trim() || toDisplayName(candidate.name);
}

function scaffoldThemeHaystack(candidate: GroundedCardCandidate): string {
  return `${String(candidate.oracle_text || "")} ${String(candidate.type_line || "")}`.toLowerCase();
}

function candidateHasPrimaryTheme(candidate: GroundedCardCandidate, profile: TagProfile): boolean {
  const primary = profile.topThemeTags[0];
  if (!primary) return true;
  const themeTags = candidate.theme_tags || [];
  const commanderTags = candidate.commander_tags || [];
  const gameplayTags = candidate.gameplay_tags || [];
  const haystack = scaffoldThemeHaystack(candidate);
  switch (primary) {
    case "tokens":
      return (
        (themeTags.includes("tokens") || commanderTags.includes("go_wide")) &&
        (/\bcreate\b.{0,80}\btoken\b|\bcreature token\b|\bpopulate\b|\bamass\b|\bincubate\b/i.test(haystack) ||
          /\bcreatures? you control\b|\bother tokens? you control\b|\bfor each creature you control\b/i.test(haystack))
      );
    case "graveyard":
    case "reanimator":
      return (
        (themeTags.includes("graveyard") || themeTags.includes("reanimator") || gameplayTags.includes("recursion")) &&
        /\bgraveyard\b|\breturn target .* from your graveyard\b|\bcast .* from your graveyard\b|\bmill\b|\bsurveil\b/i.test(haystack)
      );
    case "spellslinger":
      return (
        (themeTags.includes("spellslinger") || commanderTags.includes("spell_combo")) &&
        /\binstant or sorcery\b|\bnoncreature spell\b|\bcopy target spell\b|\bwhenever you cast (?:an )?instant or sorcery\b|\bmagecraft\b|\bstorm\b/i.test(haystack)
      );
    case "artifacts":
      return themeTags.includes("artifacts") && /\bartifact\b|\bequipment\b|\btreasure token\b|\bclue token\b/i.test(haystack);
    case "enchantments":
      return themeTags.includes("enchantments") && /\benchantment\b|\baura\b|\bconstellation\b/i.test(haystack);
    case "tribal":
      return (themeTags.includes("tribal") || commanderTags.includes("tribal_commander")) && /\bdragon\b|\belf\b|\bzombie\b|\bgoblin\b|\bvampire\b|\bmerfolk\b|\bsliver\b/i.test(haystack);
    case "blink":
      return (themeTags.includes("blink") || themeTags.includes("etb")) && /\bexile\b.{0,50}\breturn\b.{0,50}\bto the battlefield\b|\benters the battlefield\b/i.test(haystack);
    case "lands":
    case "landfall":
      return (themeTags.includes("lands") || themeTags.includes("landfall") || commanderTags.includes("big_mana")) && /\blandfall\b|\byou may play an additional land\b|\bsearch your library for (?:a|up to .*?) land\b|\bwhenever a land enters\b/i.test(haystack);
    default:
      return themeTags.includes(primary) || gameplayTags.includes(primary) || commanderTags.includes(primary);
  }
}

function candidatePassesBudget(candidate: GroundedCardCandidate, intent: ScaffoldIntent): boolean {
  const maxPrice = budgetMaxPrice(intent);
  if (maxPrice == null) return true;
  if (typeof candidate.price !== "number" || !Number.isFinite(candidate.price) || candidate.price <= 0) {
    return !String(intent.budget || "").toLowerCase().includes("budget");
  }
  return candidate.price <= maxPrice;
}

function candidatePopularityFloor(candidate: GroundedCardCandidate, profile: TagProfile): boolean {
  const popularity = Number(candidate.popularity_score ?? 0);
  if (candidateHasPrimaryTheme(candidate, profile)) return popularity >= 0.68;
  return popularity >= 0.9;
}

function filterRankedForScaffold(
  ranked: RankedGroundedCandidate[],
  profile: TagProfile,
  intent: ScaffoldIntent,
  role: "anchor" | "ramp" | "draw" | "interaction" | "finisher" | "utility",
): RankedGroundedCandidate[] {
  return ranked
    .filter((candidate) => candidatePassesBudget(candidate, intent))
    .filter((candidate) => candidatePopularityFloor(candidate, profile))
    .filter((candidate) => {
      if (role === "anchor") return candidateHasPrimaryTheme(candidate, profile) && Number(candidate.popularity_score ?? 0) >= 0.8 && (candidate.scoreBreakdown.themeFit >= 22 || candidate.scoreBreakdown.archetypeFit >= 12);
      if (role === "ramp") return candidate.scoreBreakdown.roleFit >= 12 && candidateHasPrimaryTheme(candidate, profile);
      if (role === "draw") return candidate.scoreBreakdown.roleFit >= 12 && candidateHasPrimaryTheme(candidate, profile);
      if (role === "interaction") return candidate.scoreBreakdown.roleFit >= 12 && (candidateHasPrimaryTheme(candidate, profile) || candidate.scoreBreakdown.themeFit >= 16);
      if (role === "finisher") return candidate.scoreBreakdown.roleFit >= 12 && candidateHasPrimaryTheme(candidate, profile);
      return (candidate.scoreBreakdown.themeFit >= 22 || candidate.scoreBreakdown.archetypeFit >= 12 || candidate.scoreBreakdown.roleFit >= 12) && candidateHasPrimaryTheme(candidate, profile);
    })
    .map((candidate) => ({ ...candidate, printed_name: scaffoldCandidateDisplayName(candidate) }));
}

function addCard(list: Array<{ name: string; qty: number }>, name: string, qty = 1, singleton = true) {
  const clean = String(name || "").trim();
  if (!clean) return;
  const existing = list.find((entry) => entry.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    if (!singleton) existing.qty += qty;
    return;
  }
  list.push({ name: clean, qty });
}

function fillBasics(decklist: Array<{ name: string; qty: number }>, colors: string[], landCount: number) {
  const palette = colors.length ? colors : ["U", "R"];
  const each = Math.floor(landCount / palette.length);
  let remainder = landCount - each * palette.length;
  for (const color of palette) {
    addCard(decklist, COLOR_TO_BASIC[color] || "Island", each + (remainder > 0 ? 1 : 0), false);
    if (remainder > 0) remainder -= 1;
  }
}

function pickTopUnique(candidates: GroundedCardCandidate[], limit: number, exclude: Set<string>): GroundedCardCandidate[] {
  const out: GroundedCardCandidate[] = [];
  for (const candidate of candidates) {
    const name = scaffoldCandidateDisplayName(candidate);
    const key = name.toLowerCase();
    if (!name || exclude.has(key)) continue;
    out.push(candidate);
    exclude.add(key);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchPool(
  admin: SupabaseClient,
  profile: TagProfile,
  intent: ScaffoldIntent,
  category: RecommendationIntent["desiredCategory"] | undefined,
  limit = 80,
): Promise<GroundedCardCandidate[]> {
  try {
    return await fetchGroundedCandidatesForProfile(admin, {
      formatLabel: intent.format,
      topThemeTags: profile.topThemeTags,
      topGameplayTags: category ? [] : profile.topGameplayTags,
      topArchetypeTags: profile.topArchetypeTags,
      topCommanderTags: profile.topCommanderTags,
      commanderColors: canonicalizeColors(intent.colors),
      excludeNames: intent.mustInclude.map((name) => name.toLowerCase()),
      requireCommanderEligible: false,
      limitPerBucket: limit,
      desiredCategory: category,
    });
  } catch {
    return [];
  }
}

export async function buildGroundedScaffoldDeck(admin: SupabaseClient, intent: ScaffoldIntent, aiContext: {
  userId?: string | null;
  isPro?: boolean;
  isGuest?: boolean;
}): Promise<ScaffoldDeckResult> {
  const normalizedFormat = normalizeDeckFormat(intent.format) || "commander";
  const rules = getFormatRules(normalizedFormat);
  const profile = buildManualProfile(intent);

  const colors = canonicalizeColors(intent.colors);
  if (!colors.length && intent.commander) {
    const commanderCard = await fetchCard(intent.commander).catch(() => null);
    if (commanderCard?.color_identity?.length) colors.push(...canonicalizeColors(commanderCard.color_identity));
  }

  const slotPlan = buildSlotPlan(normalizedFormat);
  const decklist: Array<{ name: string; qty: number }> = [];
  const used = new Set<string>();

  if (rules.commanderRequired && intent.commander) {
    addCard(decklist, intent.commander, 1, true);
    used.add(intent.commander.toLowerCase());
  }
  for (const must of intent.mustInclude) {
    addCard(decklist, must, 1, true);
    used.add(must.toLowerCase());
  }

  const [interactionPool, drawPool, rampPool, finishPool, themePool] = await Promise.all([
    fetchPool(admin, profile, intent, "interaction"),
    fetchPool(admin, profile, intent, "card_draw"),
    fetchPool(admin, profile, intent, "mana_base"),
    fetchPool(admin, profile, intent, "win_condition"),
    fetchPool(admin, profile, intent, undefined),
  ]);

  const recommendationIntent = buildRecommendationIntent({
    routeKind: "deck",
    formatLabel: intent.format,
    profile,
    commanderColors: colors,
    selectionCount: Math.min(slotPlan.anchors, 8),
    isGuest: aiContext.isGuest,
    isPro: aiContext.isPro,
    userId: aiContext.userId,
    routeLabel: "scaffold",
    budgetBand: inferBudgetBand(intent.budget),
    powerBand: inferPowerBand(intent.power),
    queryText: [intent.archetype, intent.theme, intent.vibe].filter(Boolean).join(" "),
  });
  const rampIntent = buildRecommendationIntent({
    routeKind: "health",
    formatLabel: intent.format,
    profile,
    commanderColors: colors,
    selectionCount: slotPlan.ramp,
    isGuest: aiContext.isGuest,
    isPro: aiContext.isPro,
    userId: aiContext.userId,
    routeLabel: "scaffold_ramp",
    desiredCategory: "mana_base",
    budgetBand: inferBudgetBand(intent.budget),
    powerBand: inferPowerBand(intent.power),
    queryText: [intent.archetype, intent.theme, intent.vibe].filter(Boolean).join(" "),
  });
  const drawIntent = buildRecommendationIntent({
    routeKind: "health",
    formatLabel: intent.format,
    profile,
    commanderColors: colors,
    selectionCount: slotPlan.draw,
    isGuest: aiContext.isGuest,
    isPro: aiContext.isPro,
    userId: aiContext.userId,
    routeLabel: "scaffold_draw",
    desiredCategory: "card_draw",
    budgetBand: inferBudgetBand(intent.budget),
    powerBand: inferPowerBand(intent.power),
    queryText: [intent.archetype, intent.theme, intent.vibe].filter(Boolean).join(" "),
  });
  const interactionIntent = buildRecommendationIntent({
    routeKind: "health",
    formatLabel: intent.format,
    profile,
    commanderColors: colors,
    selectionCount: slotPlan.interaction,
    isGuest: aiContext.isGuest,
    isPro: aiContext.isPro,
    userId: aiContext.userId,
    routeLabel: "scaffold_interaction",
    desiredCategory: "interaction",
    budgetBand: inferBudgetBand(intent.budget),
    powerBand: inferPowerBand(intent.power),
    queryText: [intent.archetype, intent.theme, intent.vibe].filter(Boolean).join(" "),
  });
  const finishIntent = buildRecommendationIntent({
    routeKind: "finish",
    formatLabel: intent.format,
    profile,
    commanderColors: colors,
    selectionCount: slotPlan.finishers,
    isGuest: aiContext.isGuest,
    isPro: aiContext.isPro,
    userId: aiContext.userId,
    routeLabel: "scaffold_finish",
    desiredCategory: "win_condition",
    budgetBand: inferBudgetBand(intent.budget),
    powerBand: inferPowerBand(intent.power),
    queryText: [intent.archetype, intent.theme, intent.vibe].filter(Boolean).join(" "),
  });

  const rankedTheme = rankGroundedCandidates(themePool, profile, recommendationIntent);
  const rankedRamp = rankGroundedCandidates(rampPool, profile, rampIntent);
  const rankedDraw = rankGroundedCandidates(drawPool, profile, drawIntent);
  const rankedInteraction = rankGroundedCandidates(interactionPool, profile, interactionIntent);
  const rankedFinish = rankGroundedCandidates(finishPool, profile, finishIntent);
  const rankedThemeCandidates = rankedTheme.map((candidate) => ({ ...candidate, printed_name: scaffoldCandidateDisplayName(candidate) }));
  const rankedRampCandidates = rankedRamp.map((candidate) => ({ ...candidate, printed_name: scaffoldCandidateDisplayName(candidate) }));
  const rankedDrawCandidates = rankedDraw.map((candidate) => ({ ...candidate, printed_name: scaffoldCandidateDisplayName(candidate) }));
  const rankedInteractionCandidates = rankedInteraction.map((candidate) => ({ ...candidate, printed_name: scaffoldCandidateDisplayName(candidate) }));
  const rankedFinishCandidates = rankedFinish.map((candidate) => ({ ...candidate, printed_name: scaffoldCandidateDisplayName(candidate) }));
  const fallbackPrimaryTheme = rankedThemeCandidates.filter((candidate) => candidateHasPrimaryTheme(candidate, profile) && candidatePassesBudget(candidate, intent));
  const filteredTheme = filterRankedForScaffold(rankedTheme, profile, intent, "anchor");
  const filteredRamp = filterRankedForScaffold(rankedRamp, profile, intent, "ramp");
  const filteredDraw = filterRankedForScaffold(rankedDraw, profile, intent, "draw");
  const filteredInteraction = filterRankedForScaffold(rankedInteraction, profile, intent, "interaction");
  const filteredFinish = filterRankedForScaffold(rankedFinish, profile, intent, "finisher");
  const filteredUtility = filterRankedForScaffold(rankedTheme, profile, intent, "utility");
  const shouldUseAiAnchorRerank = profile.topThemeTags.length === 0;
  const anchorPicks = shouldUseAiAnchorRerank
    ? await aiRerankRecommendations({
        candidates: (filteredTheme.length ? filteredTheme : fallbackPrimaryTheme.length ? fallbackPrimaryTheme : rankedThemeCandidates).slice(0, 20),
        intent: recommendationIntent,
        userId: aiContext.userId ?? null,
        isPro: !!aiContext.isPro,
      }).catch(() => ({ picks: [], fallbackUsed: true, model: "deterministic" }))
    : { picks: [], fallbackUsed: true, model: "deterministic" as const };
  const anchorPool = filteredTheme.length ? filteredTheme : fallbackPrimaryTheme.length ? fallbackPrimaryTheme : rankedThemeCandidates;
  const anchorCandidates = anchorPool.filter((candidate) =>
    anchorPicks.picks.some((pick) => pick.name.toLowerCase() === scaffoldCandidateDisplayName(candidate).toLowerCase()),
  );

  for (const candidate of pickTopUnique(anchorCandidates.length ? anchorCandidates : anchorPool, slotPlan.anchors, used)) {
    addCard(decklist, scaffoldCandidateDisplayName(candidate), 1, rules.maxCopies === 1);
  }
  for (const candidate of pickTopUnique(filteredRamp.length ? filteredRamp : rankedRampCandidates, slotPlan.ramp, used)) addCard(decklist, scaffoldCandidateDisplayName(candidate), 1, rules.maxCopies === 1);
  for (const candidate of pickTopUnique(filteredDraw.length ? filteredDraw : rankedDrawCandidates, slotPlan.draw, used)) addCard(decklist, scaffoldCandidateDisplayName(candidate), 1, rules.maxCopies === 1);
  for (const candidate of pickTopUnique(filteredInteraction.length ? filteredInteraction : rankedInteractionCandidates, slotPlan.interaction, used)) addCard(decklist, scaffoldCandidateDisplayName(candidate), 1, rules.maxCopies === 1);
  for (const candidate of pickTopUnique(filteredFinish.length ? filteredFinish : rankedFinishCandidates, slotPlan.finishers, used)) addCard(decklist, scaffoldCandidateDisplayName(candidate), 1, rules.maxCopies === 1);

  const combinedFallback = [...filteredUtility, ...fallbackPrimaryTheme, ...filteredDraw, ...filteredInteraction, ...filteredRamp, ...filteredFinish];
  for (const candidate of pickTopUnique(combinedFallback.length ? combinedFallback : fallbackPrimaryTheme.length ? fallbackPrimaryTheme : rankedThemeCandidates, slotPlan.utility, used)) {
    addCard(decklist, scaffoldCandidateDisplayName(candidate), 1, rules.maxCopies === 1);
  }

  fillBasics(decklist, colors, slotPlan.lands);
  const targetCount = rules.mainDeckTarget;
  const currentCount = decklist.reduce((sum, entry) => sum + entry.qty, 0);
  if (currentCount < targetCount) {
    fillBasics(decklist, colors, targetCount - currentCount);
  }

  const overallAim = [
    intent.commander ? `${intent.commander} build` : `${intent.title || intent.format} shell`,
    profile.topThemeTags[0] ? `leaning ${profile.topThemeTags[0].replace(/_/g, " ")}` : "",
    profile.topArchetypeTags[0] ? `with a ${profile.topArchetypeTags[0].replace(/_/g, " ")} posture` : "",
    intent.power ? `at ${intent.power} power` : "",
    intent.budget ? `and ${intent.budget} budget assumptions` : "",
  ].filter(Boolean).join(" ");

  const deckText = decklist.map((entry) => `${entry.qty} ${entry.name}`).join("\n");
  return {
    title: intent.title || `${intent.format} ${intent.archetype || intent.theme || "Deck"}`.trim(),
    format: intent.format,
    plan: intent.plan || "optimized",
    colors,
    commander: intent.commander,
    overallAim: overallAim || "A grounded near-complete shell built from theme, role, and legality signals.",
    decklist,
    deckText,
  };
}
