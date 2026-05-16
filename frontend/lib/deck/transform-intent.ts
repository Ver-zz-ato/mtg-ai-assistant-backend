/**
 * Canonical transform intents for POST /api/deck/transform.
 * Normalization is fail-open: unknown tokens → general.
 */

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Canonical intent strings returned after normalization. */
export const TRANSFORM_INTENTS = [
  "general",
  "refine_imported_deck",
  "improve_mana_base",
  "tighten_curve",
  "add_interaction",
  "lower_budget",
  "more_casual",
  "more_optimized",
  "fix_legality",
  "transform_template",
] as const;

export type TransformIntentCanonical = (typeof TRANSFORM_INTENTS)[number];

const CANONICAL = new Set<string>(TRANSFORM_INTENTS);

/** Map common aliases / legacy spellings → canonical intent. */
const ALIAS_TO_CANONICAL: Record<string, TransformIntentCanonical> = {
  general: "general",
  refine_imported_deck: "refine_imported_deck",
  refineimporteddeck: "refine_imported_deck",
  imported_deck: "refine_imported_deck",
  import_repair: "refine_imported_deck",
  repair_import: "refine_imported_deck",
  improve_mana_base: "improve_mana_base",
  improvemanabase: "improve_mana_base",
  mana_base: "improve_mana_base",
  manabase: "improve_mana_base",
  lands: "improve_mana_base",
  tighten_curve: "tighten_curve",
  tightencurve: "tighten_curve",
  curve: "tighten_curve",
  add_interaction: "add_interaction",
  more_interaction: "add_interaction",
  interaction: "add_interaction",
  lower_budget: "lower_budget",
  budget: "lower_budget",
  cheap: "lower_budget",
  more_casual: "more_casual",
  casual: "more_casual",
  more_optimized: "more_optimized",
  optimized: "more_optimized",
  spike: "more_optimized",
  fix_legality: "fix_legality",
  legality: "fix_legality",
  color_identity: "fix_legality",
  commander_legal: "fix_legality",
  transform_template: "transform_template",
  template: "transform_template",
  adapt_template: "transform_template",
};

/**
 * Normalize client transformIntent to a canonical token. Unknown → general.
 */
export function normalizeTransformIntent(raw: string): TransformIntentCanonical {
  const k = normKey(raw).slice(0, 128);
  if (!k) return "general";
  if (ALIAS_TO_CANONICAL[k]) return ALIAS_TO_CANONICAL[k];
  if (CANONICAL.has(k)) return k as TransformIntentCanonical;
  return "general";
}

/**
 * Human-readable one-liner for API summary (stable wording).
 */
export function summarizeTransformIntent(canonical: TransformIntentCanonical): string {
  const labels: Record<TransformIntentCanonical, string> = {
    general: "General refinement",
    refine_imported_deck: "Imported deck cleanup",
    improve_mana_base: "Mana base improvement",
    tighten_curve: "Curve tightening",
    add_interaction: "More interaction",
    lower_budget: "Budget reduction",
    more_casual: "More casual",
    more_optimized: "More optimized",
    fix_legality: "Legality / color identity fix",
    transform_template: "Template adaptation",
  };
  return labels[canonical] ?? canonical;
}

/**
 * Strong intent-specific instructions (user prompt). Preserve deck identity unless intent says otherwise.
 */
export function buildTransformIntentPromptBlock(canonical: TransformIntentCanonical): string {
  const preserve = [
    "PRESERVATION (mandatory unless intent says otherwise):",
    "You are revising an EXISTING decklist — not generating a random new deck.",
    "Keep the same commander when one is given or clearly identifiable in the source.",
    "Preserve the deck's theme, synergies, and signature cards when they fit legality and the transform goal.",
    "Only replace cards when needed to satisfy the intent, color identity, format legality, or constraints.",
  ].join("\n");

  const blocks: Record<TransformIntentCanonical, string> = {
    general: [
      preserve,
      "",
      "INTENT: general — Improve overall coherence, trim weak cards, and fix obvious issues while keeping the deck recognizable.",
      "- Use a light touch first. Prefer roughly 6–12 total swaps.",
      "- Do not exceed roughly 16 total swaps unless the source deck has clear legality, mana, or structural problems that force broader cleanup.",
      "- Preserve the current manabase unless it is obviously unstable, illegal, or badly mismatched to the deck's colors.",
      "- For non-Commander / constructed decks, keep the deck's overall land count close to the original unless the source count is clearly broken.",
      "- For non-Commander / constructed decks, do not replace large batches of lands with generic threats or sidegrade spells in a general-cleanup pass.",
      "- For non-Commander / constructed decks, treat general cleanup as a very small tune-up: usually no more than 4–8 maindeck card swaps total.",
    ].join("\n"),

    refine_imported_deck: [
      preserve,
      "",
      "INTENT: refine_imported_deck — Typical import cleanup:",
      "- Fix obvious name/format issues, singleton rules, and basic land counts where needed.",
      "- Align with Commander legality and commander color identity.",
      "- Improve curve and redundancy slightly without replacing the whole strategy.",
    ].join("\n"),

    improve_mana_base: [
      preserve,
      "",
      "INTENT: improve_mana_base — Focus on lands, ramp, and mana fixing:",
      "- Adjust land count toward a healthy Commander manabase (often ~35–38 lands; utility lands where appropriate).",
      "- Tune ramp (rocks, dorks, land ramp) for speed and color consistency.",
      "- Do not rip out the deck's win lines or theme; change nonland spells only when they block mana stability.",
      "- Keep nonland swaps tightly scoped to mana pieces only: mana rocks, dorks, land ramp, fixing, or obvious over-costed ramp slots.",
      "- Do not add generic attackers, payoff creatures, or unrelated value cards in this pass.",
      "- Preserve or slightly improve total land count unless the source list is clearly flooded; a mana-base pass should not quietly cut the deck's land foundation.",
    ].join("\n"),

    tighten_curve: [
      preserve,
      "",
      "INTENT: tighten_curve — Lower clunk, smooth the curve:",
      "- Prefer efficient 1–4 mana plays; cut or replace top-end that does not close games.",
      "- Keep finishers that matter; remove durdle and redundant high-CMC filler.",
    ].join("\n"),

    add_interaction: [
      preserve,
      "",
      "INTENT: add_interaction — More answers without orphaning the theme:",
      "- Add removal, counters, bounce, and flexible interaction on-color.",
      "- Trim the lowest-impact value or win-more cards to make room; do not delete the deck's identity engine.",
    ].join("\n"),

    lower_budget: [
      preserve,
      "",
      "INTENT: lower_budget — Cheaper substitutes, same game plan:",
      "- Replace expensive staples with functional budget options where possible.",
      "- Preserve strategy and power band implied by constraints; avoid cEDH upgrades.",
    ].join("\n"),

    more_casual: [
      preserve,
      "",
      "INTENT: more_casual — Softer, table-friendly patterns:",
      "- Avoid hard locks, two-card instant wins, and oppressive fast combos unless already central to the deck.",
      "- Prefer interactive, multiplayer-sensible cards.",
    ].join("\n"),

    more_optimized: [
      preserve,
      "",
      "INTENT: more_optimized — Tighten power within stated power level:",
      "- Improve consistency (tutors, redundancy) and interaction quality where appropriate.",
      "- Cut dead weight and cute cards that do not advance the plan.",
    ].join("\n"),

    fix_legality: [
      "PRESERVATION: Keep commander and theme when legal.",
      "",
      "INTENT: fix_legality — Compliance first:",
      "- If the source deck is already legal for the format, return it unchanged.",
      "- Do not make optimization, mana-base, or preference swaps unless they are strictly required to restore legality or deck-size compliance.",
      "- Remove or replace cards outside commander color identity.",
      "- Remove banned or illegal cards for Commander; replace with reasonable on-theme substitutes.",
      "- Preserve as much of the original list as legality allows.",
    ].join("\n"),

    transform_template: [
      preserve,
      "",
      "INTENT: transform_template — Template / shell adaptation:",
      "- Keep the backbone (mana, key synergies) from the source list.",
      "- Adapt flex slots and payoffs using notes/constraints; fill to a complete 100-card legal deck.",
    ].join("\n"),
  };

  return blocks[canonical];
}
