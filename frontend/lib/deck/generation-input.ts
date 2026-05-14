/**
 * Normalized optional structured inputs for /api/deck/generate-from-collection.
 * All structured fields are optional; legacy-only bodies behave as before.
 */

import type { TransformIntentCanonical } from "@/lib/deck/transform-intent";
import {
  normalizeTransformIntent as normalizeTransformIntentToken,
  buildTransformIntentPromptBlock,
} from "@/lib/deck/transform-intent";
import { getFormatRules, isCommanderFormatString } from "@/lib/deck/formatRules";

export type NormalizedGenerationInput = {
  collectionId: string | null;
  commander: string | null;
  playstyle: string | null;
  powerLevel: string;
  budget: string;
  format: string;
  /** Structured intent; unknown strings are still passed through in the prompt (fail-open). */
  generationIntent: string | null;
  seedCard: string | null;
  buildMode: string | null;
  refinement: string | null;
  /** Optional deck text when transforming/repairing or using import as context. */
  sourceDeckText: string | null;
  ideaText: string | null;
  /** JSON string or plain string — never required. */
  templateContext: string | null;
  notes: string | null;
};

/** Normalize client tokens (e.g. core-shell → core_shell). */
function normalizeModeRefKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const GENERATION_INTENT_HINTS: Record<string, string> = {
  new_build: "Start a fresh 100-card deck from constraints (not a direct edit of an imported list unless source deck text is provided).",
  build_around_card: "Center the deck on the seed card and cards that synergize with it.",
  idea_to_deck: "Use the idea text to pick commander and theme when commander is not fixed.",
  quiz_build: "Use the playstyle quiz profile as binding deck identity: keep the recommended commander, selected power level, selected budget tier, and selected build shape aligned.",
  transform_template: "Treat template context as a starting shell; adapt it to the collection and constraints.",
  repair_import: "Fix legality, color identity, and coherence issues when source deck text is provided.",
};

function strOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function longTextOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function templateContextToString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t ? (t.length > 8000 ? t.slice(0, 8000) : t) : null;
  }
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 8000 ? s.slice(0, 8000) : s;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parse request body — no throws; callers validate business rules (e.g. collectionId OR commander).
 */
export function normalizeGenerationBody(body: unknown): NormalizedGenerationInput {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const collectionId = typeof b.collectionId === "string" ? b.collectionId.trim() : null;
  const commander = typeof b.commander === "string" ? b.commander.trim() : null;
  const playstyle = typeof b.playstyle === "string" ? b.playstyle.trim() : null;
  const powerLevel = typeof b.powerLevel === "string" && b.powerLevel.trim() ? b.powerLevel.trim() : "Casual";
  const budget = typeof b.budget === "string" && b.budget.trim() ? b.budget.trim() : "Moderate";
  const format = typeof b.format === "string" && b.format.trim() ? b.format.trim() : "Commander";

  const generationIntent = strOrNull(b.generationIntent, 64);
  const seedCard = strOrNull(b.seedCard, 300);
  const buildMode = strOrNull(b.buildMode, 64);
  const refinement = strOrNull(b.refinement, 64);
  const sourceDeckText = longTextOrNull(b.sourceDeckText, 120_000);
  const ideaText = longTextOrNull(b.ideaText, 16_000);
  const templateContext = templateContextToString(b.templateContext);
  const notes = longTextOrNull(b.notes, 8000);

  return {
    collectionId: collectionId || null,
    commander: commander || null,
    playstyle: playstyle || null,
    powerLevel,
    budget,
    format,
    generationIntent,
    seedCard,
    buildMode: buildMode || null,
    refinement,
    sourceDeckText,
    ideaText,
    templateContext,
    notes,
  };
}

/**
 * Operational build-mode text for the model. Output remains a plain 100-line decklist (no section headers);
 * modes bias *card choice* only. Empty when absent or when nothing to add.
 */
export function buildModePromptDirective(buildMode: string | null): string {
  if (!buildMode?.trim()) return "";
  const m = normalizeModeRefKey(buildMode);
  if (m === "full_deck") {
    return [
      "BUILD MODE (mandatory — follow when choosing cards): full_deck",
      "Produce a standard, complete 100-card Commander list: a normal land count (typically ~35–38 lands including utility lands), adequate ramp and card draw, interaction, and clear win lines. Balance all roles; do not emphasize a shell/flex split.",
    ].join("\n");
  }
  if (m === "core_shell") {
    return [
      "BUILD MODE (mandatory — follow when choosing cards): core_shell",
      "Still output exactly 100 lines of \"qty Card Name\" with no labels or commentary. Bias card selection toward: (1) a stable mana base (~35–38 lands) and ~8–12 ramp sources where possible, (2) the deck's engine, payoffs, and synergy density in nonland slots before filler, (3) interaction and protection that directly support the commander's plan.",
      "Prioritize cards that are redundant with the strategy (multiple ways to execute the same game plan) over scattered goodstuff that does not advance the theme.",
    ].join("\n");
  }
  if (m === "staples_flex") {
    return [
      "BUILD MODE (mandatory — follow when choosing cards): staples_flex",
      "Still output exactly 100 plain lines. Structure choices as: (1) efficient format-wide staples for mana fixing, ramp, and must-answer interaction (on-color), (2) reserve roughly 15–25 slots for flexible, theme-specific, or meta-dependent cards that define deck identity.",
      "Do not skimp on interaction or ramp to add flex; staples carry consistency, flex carries flavor.",
    ].join("\n");
  }
  return [
    `BUILD MODE (non-standard token "${buildMode.trim()}" — still apply):`,
    "Interpret as: keep a coherent 100-card Commander list, but lean choices toward what that label suggests without breaking color identity or legality.",
  ].join("\n");
}

/**
 * Strong refinement guidance. Empty when absent.
 */
export function refinementPromptDirective(refinement: string | null): string {
  if (!refinement?.trim()) return "";
  const r = normalizeModeRefKey(refinement);
  const map: Record<string, string> = {
    more_ramp: [
      "REFINEMENT (mandatory — follow when choosing cards): more_ramp",
      "Increase mana acceleration: aim for roughly 10–14 ramp sources total (land ramp, mana dorks, mana rocks, spells that put extra lands or mana into play) unless the commander/budget forbids. Prefer adding ramp before cutting lands.",
    ].join("\n"),
    more_card_draw: [
      "REFINEMENT (mandatory — follow when choosing cards): more_card_draw",
      "Increase card advantage: aim for roughly 8–12+ sources that draw cards, rummage, or loot (including attached to creatures/artifacts, wheels, and efficient cantrips). Trim low-impact filler or redundant win-more before cutting lands or ramp.",
    ].join("\n"),
    more_interaction: [
      "REFINEMENT (mandatory — follow when choosing cards): more_interaction",
      "Increase interaction density: aim for roughly 10–15+ spells or permanents that answer threats (creature removal, artifact/enchantment removal, counterspells, bounce). If space is tight, trim lower-impact value or win-more cards first.",
    ].join("\n"),
    lower_budget: [
      "REFINEMENT (mandatory — follow when choosing cards): lower_budget",
      "Prefer budget and affordable reprints; avoid chase Reserved List or unnecessarily expensive singles when a cheaper card fills the same role. Prioritize function over price prestige.",
    ].join("\n"),
    faster_curve: [
      "REFINEMENT (mandatory — follow when choosing cards): faster_curve",
      "Lower the curve: favor 1–3 mana plays; minimize clunky 6+ mana spells except finishers or essential top-end. Trim slow haymakers that do not close games.",
    ].join("\n"),
    more_on_theme: [
      "REFINEMENT (mandatory — follow when choosing cards): more_on_theme",
      "Prioritize synergy with the commander and stated theme. Replace generic staples that do not advance the plan when an on-theme alternative exists at similar power.",
    ].join("\n"),
    more_casual: [
      "REFINEMENT (mandatory — follow when choosing cards): more_casual",
      "Avoid cEDH-style fast-combo stacks, hard locks, and two-card instant wins unless power level demands it. Prefer interactive, multiplayer-friendly patterns.",
    ].join("\n"),
    more_optimized: [
      "REFINEMENT (mandatory — follow when choosing cards): more_optimized",
      "Tighten efficiency: better curve, redundant interaction, fewer dead or cute cards; tutors and consistency tools where appropriate. Stay within the stated power level and budget.",
    ].join("\n"),
  };
  if (map[r]) return map[r];
  return [
    `REFINEMENT (non-standard token "${refinement.trim()}" — still apply):`,
    "Weight card choices toward what that label implies while staying Commander-legal and on-color.",
  ].join("\n");
}

/** Comma-separated chip ids from mobile (e.g. `more_card_draw,more_ramp`) → one block per known token. */
export function refinementPromptDirectivesJoined(refinement: string | null): string {
  if (!refinement?.trim()) return "";
  const tokens = refinement
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const blocks = tokens.map((t) => refinementPromptDirective(t)).filter(Boolean);
  return blocks.join("\n\n");
}

/** Combined block for generate structured section or transform user prompt. */
export function formatBuildModeAndRefinementDirectives(
  buildMode: string | null,
  refinement: string | null
): string {
  const parts: string[] = [];
  const bm = buildModePromptDirective(buildMode);
  const rf = refinementPromptDirectivesJoined(refinement);
  if (bm) parts.push(bm);
  if (rf) parts.push(rf);
  if (parts.length === 0) return "";
  return parts.join("\n\n");
}

function buildModeUserAddendum(input: NormalizedGenerationInput): string {
  return buildModePromptDirective(input.buildMode);
}

function refinementAddendum(input: NormalizedGenerationInput): string {
  return refinementPromptDirectivesJoined(input.refinement);
}

function structuredIntentSection(input: NormalizedGenerationInput): string {
  const lines: string[] = [];
  if (input.generationIntent) {
    const hint = GENERATION_INTENT_HINTS[input.generationIntent];
    lines.push(
      `Generation intent: ${input.generationIntent}${hint ? `. ${hint}` : ""}`
    );
  }
  if (input.seedCard) {
    lines.push(
      `Seed card: "${input.seedCard}". Build the deck around this card when legal; include it in the 99 if it fits the commander identity.`
    );
  }
  if (input.ideaText) {
    lines.push(`Deck idea / theme (use to pick commander and strategy when helpful): ${input.ideaText}`);
  }
  if (input.sourceDeckText) {
    lines.push(
      `Reference or existing deck text (repair, transform, or align with this): ${input.sourceDeckText.slice(0, 24_000)}`
    );
  }
  if (input.templateContext) {
    lines.push(`Template / preset context: ${input.templateContext}`);
  }
  if (input.notes) {
    lines.push(`Additional notes: ${input.notes}`);
  }
  const modeExtra = buildModeUserAddendum(input);
  if (modeExtra) lines.push(modeExtra);
  const refExtra = refinementAddendum(input);
  if (refExtra) lines.push(refExtra);
  lines.push(selectedOptionsDirective(input));

  if (lines.length === 0) return "";
  return `\nStructured instructions (follow when compatible with the rules above):\n${lines.join("\n")}\n`;
}

/** Reminder line so BUILD MODE / REFINEMENT are not treated as optional flavor text. */
function buildDirectiveComplianceReminder(input: NormalizedGenerationInput): string {
  const hasDirectives = input.buildMode?.trim() || input.refinement?.trim() || input.powerLevel?.trim() || input.budget?.trim();
  if (!hasDirectives) return "";
  return "\nCompliance: Where BUILD MODE, POWER LEVEL, or BUDGET directives conflict with generic deck-building advice, obey the explicit selected options.\n";
}

function powerLevelPromptDirective(powerLevel: string): string {
  const p = normalizeModeRefKey(powerLevel);
  if (p === "casual") {
    return [
      "POWER LEVEL (mandatory): Casual",
      "Build for relaxed Commander tables. Avoid cEDH staples, fast mana, dense tutors, deterministic two-card wins, hard locks, and excessive free interaction.",
    ].join("\n");
  }
  if (p === "mid") {
    return [
      "POWER LEVEL (mandatory): Mid",
      "Build a solid mid-power deck, not Optimized. Use coherent synergy, fair ramp/draw/removal, and a few strong payoffs. Avoid fast mana, tutor density, cEDH combo packages, stax locks, and premium efficiency piles.",
    ].join("\n");
  }
  if (p === "focused") {
    return [
      "POWER LEVEL (mandatory): Focused",
      "Build an upgraded synergy deck with tight roles and strong redundancy, but still below Optimized/cEDH. Use efficient interaction and a clear plan without turning into fast-combo goodstuff.",
    ].join("\n");
  }
  if (p === "optimized") {
    return [
      "POWER LEVEL (mandatory): Optimized",
      "Build a high-efficiency casual-competitive Commander deck with strong synergy, efficient ramp/draw/removal, and consistency. Stay below explicit Competitive/cEDH unless the selected power level is Competitive.",
    ].join("\n");
  }
  if (p === "competitive") {
    return [
      "POWER LEVEL (mandatory): Competitive",
      "Build for very high power/cEDH-leaning Commander: efficient engines, compact win lines, strong interaction, and fast mana if the budget tier permits it.",
    ].join("\n");
  }
  return `POWER LEVEL (mandatory): ${powerLevel}. Match this selected tier exactly; do not silently upgrade or downgrade it.`;
}

function budgetPromptDirective(budget: string): string {
  const b = normalizeModeRefKey(budget);
  if (b === "budget") {
    return [
      "BUDGET TIER (mandatory): Budget",
      "Keep the total deck cost genuinely low: target roughly $100-$200 for the 99 where possible.",
      "Avoid expensive staples unless they are the chosen commander or absolutely central and no cheap analogue exists. Avoid Mana Crypt, Jeweled Lotus, Dockside Extortionist, The One Ring, Rhystic Study, Smothering Tithe, Cyclonic Rift, Fierce Guardianship, Demonic Tutor, Vampiric Tutor, fetch lands, shock lands, original duals, Gaea's Cradle, Ancient Tomb, and other chase staples.",
      "Use budget mana fixing, basics, tapped/slow duals, cheap ramp, and affordable synergy cards instead of premium goodstuff.",
    ].join("\n");
  }
  if (b === "moderate") {
    return [
      "BUDGET TIER (mandatory): Moderate",
      "Use some upgrades and efficient staples, but avoid luxury mana bases and very expensive chase cards unless uniquely important. Prefer affordable replacements when card role is similar.",
    ].join("\n");
  }
  if (b === "high") {
    return [
      "BUDGET TIER (mandatory): High",
      "Premium cards are allowed when they fit the selected power level. Do not include expensive cards merely for price prestige; every premium card must support the deck plan.",
    ].join("\n");
  }
  return `BUDGET TIER (mandatory): ${budget}. Match this selected budget exactly; do not use a more expensive tier unless explicitly requested.`;
}

function selectedOptionsDirective(input: NormalizedGenerationInput): string {
  return [
    "SELECTED OPTIONS (mandatory):",
    powerLevelPromptDirective(input.powerLevel),
    budgetPromptDirective(input.budget),
  ].join("\n");
}

export function buildGenerationSystemPrompt(): string {
  return `You are an expert Magic: The Gathering deck builder. Your task is to output a valid Commander decklist.

CRITICAL RULES:
0. Start your reply with the first deck line immediately (e.g. "1 Commander Name"). No introduction, title, or summary. Group basic lands by type on one line each (e.g. "32 Mountain") so the full 100-card list fits in the output limit.
1. Output ONLY the decklist, one card per line, format: "1 Card Name" (quantity then card name).
2. For Commander format: EXACTLY 100 cards total including the commander. Not 98, not 99, not 101. Count quantities before answering; grouped basics count by their quantity.
3. Every card MUST be within the commander's color identity. NO cards with colors outside the commander's identity (e.g. if commander is WUBG, ZERO red cards - no Lightning Bolt, no Boros Signet, no Izzet Signet, no Rakdos Signet, no Blasphemous Act).
4. Singleton except for basic lands (Plains, Island, Swamp, Mountain, Forest).
5. All cards must be legal in Commander (no silver-bordered, no banned cards).
6. Prefer cards from the user's collection when provided; only add cards outside the collection if needed for a coherent deck.
7. Include ramp, card draw, removal, and win conditions.
8. Obey the selected power level and budget tier exactly. Do not silently upgrade Mid to Optimized, or Budget to Moderate/High.
9. Do NOT include any commentary, markdown, or extra text. Only the decklist lines.`;
}

export function buildGenerationUserPrompt(input: NormalizedGenerationInput, collectionList: string): string {
  const commanderLine = input.commander
    ? `Commander: ${input.commander}. Build a 100-card Commander deck with this commander in the 99 or as the commander (include it once).`
    : "No commander specified. Pick a well-known commander that fits the collection and build a 100-card Commander deck. Include the commander.";

  const structured = structuredIntentSection(input);
  const compliance = buildDirectiveComplianceReminder(input);

  return `Build a Commander deck with these constraints:

${commanderLine}

User's collection (prioritize these cards):
${collectionList}

Playstyle: ${input.playstyle || "general"}
Power level: ${input.powerLevel}
Budget: ${input.budget}
${structured}${compliance}Output EXACTLY 100 cards. Double-check: no cards outside the commander's color identity. Output the decklist as plain text, one line per card (e.g. "1 Sol Ring").`;
}

export type NormalizedTransformInput = {
  sourceDeckText: string;
  format: string;
  commander: string | null;
  /** Canonical transform intent (unknown raw values map to general). */
  transformIntent: TransformIntentCanonical;
  powerLevel: string;
  budget: string;
  /** Optional; same semantics as generate-from-collection (additive). */
  buildMode: string | null;
  refinement: string | null;
  constraints: string | null;
  notes: string | null;
};

export function normalizeTransformBody(body: unknown): { ok: true; input: NormalizedTransformInput } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const sourceDeckText = typeof b.sourceDeckText === "string" ? b.sourceDeckText.trim() : "";
  if (!sourceDeckText) {
    return { ok: false, error: "sourceDeckText is required" };
  }
  if (sourceDeckText.length < 5) {
    return { ok: false, error: "sourceDeckText is too short" };
  }
  if (sourceDeckText.length > 120_000) {
    return { ok: false, error: "sourceDeckText exceeds maximum length" };
  }

  const format = typeof b.format === "string" && b.format.trim() ? b.format.trim() : "Commander";
  const commander = typeof b.commander === "string" ? b.commander.trim() || null : null;
  const tiRaw =
    typeof b.transformIntent === "string" && b.transformIntent.trim()
      ? b.transformIntent.trim()
      : typeof b.transformType === "string" && b.transformType.trim()
        ? b.transformType.trim()
        : "general";
  const ti = normalizeTransformIntentToken(tiRaw.slice(0, 128));
  const powerLevel = typeof b.powerLevel === "string" && b.powerLevel.trim() ? b.powerLevel.trim() : "Casual";
  const budget = typeof b.budget === "string" && b.budget.trim() ? b.budget.trim() : "Moderate";
  const constraints =
    typeof b.constraints === "string"
      ? b.constraints.trim().slice(0, 8000) || null
      : Array.isArray(b.constraints)
        ? b.constraints
            .filter((x) => typeof x === "string")
            .join(", ")
            .slice(0, 8000) || null
        : null;
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 8000) || null : null;
  const buildMode = strOrNull(b.buildMode, 64);
  const refinement = strOrNull(b.refinement, 64);

  return {
    ok: true,
    input: {
      sourceDeckText,
      format,
      commander,
      transformIntent: ti,
      powerLevel,
      budget,
      buildMode,
      refinement,
      constraints,
      notes,
    },
  };
}

export function buildTransformSystemPrompt(format: string): string {
  const rules = getFormatRules(format);
  const isCommander = isCommanderFormatString(format);
  const formatRules = isCommander
    ? [
        "2. For Commander format: EXACTLY 100 cards total. Not 99, not 101. Count must be 100.",
        "3. Every card MUST be within the commander's color identity. NO off-identity colors.",
        "4. Singleton except for basic lands and explicit rules exceptions.",
        "5. All cards must be legal in Commander.",
      ]
    : [
        `2. For ${rules.analyzeAs}: output a competitive ${rules.mainDeckTarget}-card mainboard.`,
        `3. Constructed copy limit: max ${rules.maxCopies} copies per non-basic card.`,
        "4. Do not use Commander-only singleton, color identity, commander tax, or command-zone assumptions.",
        `5. All cards must be legal in ${rules.analyzeAs}.`,
      ];
  return `You are an expert Magic: The Gathering deck builder. You MODIFY an existing decklist - you do not invent a brand-new deck unless the source is unusable.

Your job is to read the SOURCE DECK below and output a REPLACEMENT full ${format} decklist that applies the user's transform goal while preserving commander, theme, and strategy whenever the instructions allow.

CRITICAL RULES:
1. Output ONLY the decklist, one card per line, format: "1 Card Name" (quantity then card name).
${formatRules.join("\n")}
6. Do NOT include commentary, markdown, or extra text. Only the decklist lines.`;
}

export function buildTransformUserPrompt(input: NormalizedTransformInput): string {
  const inputIsCommander = isCommanderFormatString(input.format);
  const commanderLine = inputIsCommander
    ? input.commander
      ? `Commander (preserve unless legality requires change): ${input.commander}.`
      : "Infer commander from the source list if identifiable; otherwise pick one commander that matches the deck's colors and theme."
    : "No commander exists for this format. Treat any provided commander value as a normal card only if legal in the format.";

  const intentBlock = buildTransformIntentPromptBlock(input.transformIntent);

  const modeRef = formatBuildModeAndRefinementDirectives(input.buildMode, input.refinement);
  const modeRefBlock = modeRef ? `${modeRef}\n\n` : "";

  const extra: string[] = [];
  if (input.constraints) extra.push(`Constraints: ${input.constraints}`);
  if (input.notes) extra.push(`Notes: ${input.notes}`);
  const extraBlock = extra.length ? `\n${extra.join("\n")}\n` : "";

  const compliance =
    input.buildMode?.trim() || input.refinement?.trim()
      ? "\nCompliance: Where BUILD MODE or REFINEMENT directives conflict with generic advice, obey the directives.\n"
      : "";
  const rules = getFormatRules(input.format);
  const isCommander = isCommanderFormatString(input.format);
  const sourceHeading = isCommander
    ? "--- SOURCE DECK (edit this list into an improved 100-card Commander deck) ---"
    : `--- SOURCE DECK (edit this list into an improved ${rules.mainDeckTarget}-card ${rules.analyzeAs} mainboard) ---`;
  const outputLine = isCommander
    ? "Output EXACTLY 100 cards for Commander. Double-check color identity and Commander singleton rules."
    : `Output a ${rules.mainDeckTarget}-card ${rules.analyzeAs} mainboard. Double-check legality and constructed copy limits; do not apply Commander-only rules.`;

  return `TASK: Revise the SOURCE DECK below — do not ignore it and generate an unrelated list.

${commanderLine}

${intentBlock}

${modeRefBlock}Canonical transform intent: ${input.transformIntent}
Power level: ${input.powerLevel}
Budget: ${input.budget}
${extraBlock}
${sourceHeading}
${input.sourceDeckText.slice(0, 24_000)}
--- END SOURCE ---
${compliance}
${outputLine}`;
}
