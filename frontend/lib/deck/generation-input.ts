/**
 * Normalized optional structured inputs for /api/deck/generate-from-collection.
 * All structured fields are optional; legacy-only bodies behave as before.
 */

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

const KNOWN_BUILD_MODES = new Set(["full_deck", "core_shell", "staples_flex"]);

const GENERATION_INTENT_HINTS: Record<string, string> = {
  new_build: "Start a fresh 100-card deck from constraints (not a direct edit of an imported list unless source deck text is provided).",
  build_around_card: "Center the deck on the seed card and cards that synergize with it.",
  idea_to_deck: "Use the idea text to pick commander and theme when commander is not fixed.",
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

function buildModeUserAddendum(input: NormalizedGenerationInput): string {
  const m = input.buildMode;
  if (!m || m === "full_deck") return "";
  if (m === "core_shell") {
    return "Build mode: core shell — emphasize a tight nonland core (synergy, ramp, win lines) with a complete 100-card Commander-legal list; still output exactly 100 cards.";
  }
  if (m === "staples_flex") {
    return "Build mode: staples + flex — use solid format staples for mana and interaction; reserve slots for flexible on-theme choices.";
  }
  if (!KNOWN_BUILD_MODES.has(m)) {
    return `Build mode requested: "${m}" (non-standard; interpret as a slight emphasis on a coherent deck).`;
  }
  return "";
}

function refinementAddendum(input: NormalizedGenerationInput): string {
  const r = input.refinement;
  if (!r) return "";
  const hints: Record<string, string> = {
    more_ramp: "Include more mana acceleration (lands, rocks, dorks) while staying legal.",
    more_interaction: "Include more removal, counters, and stack interaction.",
    lower_budget: "Prefer lower-cost card options where possible; avoid unnecessary luxury cards.",
    faster_curve: "Lower average CMC and prioritize efficient plays.",
    more_on_theme: "Tighten synergy with the commander and theme; avoid off-theme fillers.",
    more_casual: "Favor fun, table-friendly cards over hard optimization.",
    more_optimized: "Strengthen consistency and power within the stated power band.",
  };
  const line = hints[r] || `Refinement preference: ${r}.`;
  return line;
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

  if (lines.length === 0) return "";
  return `\nStructured instructions (follow when compatible with the rules above):\n${lines.join("\n")}\n`;
}

export function buildGenerationSystemPrompt(): string {
  return `You are an expert Magic: The Gathering deck builder. Your task is to output a valid Commander decklist.

CRITICAL RULES:
1. Output ONLY the decklist, one card per line, format: "1 Card Name" (quantity then card name).
2. For Commander format: EXACTLY 100 cards total. Not 99, not 101. Count must be 100.
3. Every card MUST be within the commander's color identity. NO cards with colors outside the commander's identity (e.g. if commander is WUBG, ZERO red cards - no Lightning Bolt, no Boros Signet, no Izzet Signet, no Rakdos Signet, no Blasphemous Act).
4. Singleton except for basic lands (Plains, Island, Swamp, Mountain, Forest).
5. All cards must be legal in Commander (no silver-bordered, no banned cards).
6. Prefer cards from the user's collection when provided; only add cards outside the collection if needed for a coherent deck.
7. Include ramp, card draw, removal, and win conditions.
8. Do NOT include any commentary, markdown, or extra text. Only the decklist lines.`;
}

export function buildGenerationUserPrompt(input: NormalizedGenerationInput, collectionList: string): string {
  const commanderLine = input.commander
    ? `Commander: ${input.commander}. Build a 100-card Commander deck with this commander in the 99 or as the commander (include it once).`
    : "No commander specified. Pick a well-known commander that fits the collection and build a 100-card Commander deck. Include the commander.";

  const structured = structuredIntentSection(input);

  return `Build a Commander deck with these constraints:

${commanderLine}

User's collection (prioritize these cards):
${collectionList}

Playstyle: ${input.playstyle || "general"}
Power level: ${input.powerLevel}
Budget: ${input.budget}
${structured}
Output EXACTLY 100 cards. Double-check: no cards outside the commander's color identity. Output the decklist as plain text, one line per card (e.g. "1 Sol Ring").`;
}

export type NormalizedTransformInput = {
  sourceDeckText: string;
  format: string;
  commander: string | null;
  transformIntent: string;
  powerLevel: string;
  budget: string;
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
  const ti =
    typeof b.transformIntent === "string" && b.transformIntent.trim()
      ? b.transformIntent.trim()
      : typeof b.transformType === "string" && b.transformType.trim()
        ? b.transformType.trim()
        : "general";
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

  return {
    ok: true,
    input: {
      sourceDeckText,
      format,
      commander,
      transformIntent: ti.slice(0, 128),
      powerLevel,
      budget,
      constraints,
      notes,
    },
  };
}

export function buildTransformSystemPrompt(format: string): string {
  return `You are an expert Magic: The Gathering deck builder. Revise and output a complete ${format} decklist.

CRITICAL RULES:
1. Output ONLY the decklist, one card per line, format: "1 Card Name" (quantity then card name).
2. For Commander format: EXACTLY 100 cards total. Not 99, not 101. Count must be 100.
3. Every card MUST be within the commander's color identity. NO off-identity colors.
4. Singleton except for basic lands (Plains, Island, Swamp, Mountain, Forest).
5. All cards must be legal in Commander (no silver-bordered, no banned cards).
6. Do NOT include commentary, markdown, or extra text. Only the decklist lines.`;
}

export function buildTransformUserPrompt(input: NormalizedTransformInput): string {
  const commanderLine = input.commander
    ? `Commander: ${input.commander}.`
    : "Infer commander from the list if present; otherwise choose a commander that fits the deck.";

  const extra: string[] = [];
  if (input.constraints) extra.push(`Constraints: ${input.constraints}`);
  if (input.notes) extra.push(`Notes: ${input.notes}`);
  const extraBlock = extra.length ? `\n${extra.join("\n")}\n` : "";

  return `Transform the following deck. ${commanderLine}

Transform intent: ${input.transformIntent}
Power level: ${input.powerLevel}
Budget: ${input.budget}
${extraBlock}
Source deck (revise and improve this list):
${input.sourceDeckText.slice(0, 24_000)}

Output EXACTLY 100 cards for Commander. Double-check color identity.`;
}
