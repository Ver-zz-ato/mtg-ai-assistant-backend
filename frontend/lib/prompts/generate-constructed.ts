/**
 * Prompts for 60-card competitive constructed formats (Modern, Pioneer, Standard, Pauper).
 * Intentionally different from Commander: tournament Magic, copies, curve, sideboard, legality.
 */

import type { ConstructedSeedPromptPayload } from "@/lib/deck/generate-constructed-templates";

export type ConstructedBudget = "budget" | "balanced" | "premium";
export type ConstructedPower = "casual" | "strong" | "competitive";

/** Optional anchor from Phase 2C collection “idea → full deck” flow. Does not replace JSON deck shape rules. */
export type SeedFromIdeaInput = {
  title: string;
  archetype?: string;
  colors?: string[];
  coreCards?: string[];
};

export type ConstructedPromptInput = {
  format: "Modern" | "Pioneer" | "Standard" | "Pauper";
  colors?: string[];
  archetype?: string;
  budget?: ConstructedBudget;
  powerLevel?: ConstructedPower;
  ownedCards?: string[];
  notes?: string;
  /** When true, append extra emphasis on format legality and exact names */
  strictLegalityRetry?: boolean;
  /** Validated template shell from {@link getConstructedSeedTemplate} — optional */
  seedPrompt?: ConstructedSeedPromptPayload | null;
  /** User chose a labeled idea — reinforce title/archetype and priority cards in prose only */
  seedFromIdea?: SeedFromIdeaInput | null;
};

const COMMANDER_FORBIDDEN = `
Do NOT use Commander / EDH concepts unless the user explicitly asks for comparison: singleton as a deck rule, commander tax, the command zone, politics, pod/table talk, 100-card singleton, or "brackets". This is 60-card constructed with normal copy limits (4-of non-basics; basic lands any quantity).
`.trim();

const CONSTRUCTED_GOALS = `
Prioritize for this format:
- Coherent mana curve and a clear game plan
- Consistency (appropriate duplicates; use playsets where correct)
- Interaction relevant to the metagame (removal, countermagic, discard, hate where appropriate)
- A stable mana base (realistic duals/shocks/temples/checklands consistent with budget tier)
- A purposeful sideboard (15 cards unless format constraints dictate otherwise — Pauper still uses a 15-card side)
- Clear win condition(s)
- Enough playable lands (typically ~22–26 lands depending on archetype; aggro lower, control higher)
- Strict ${'{FORMAT}'} legality — every card must be legal including bans (follow official banned lists).
`.trim();

export function buildConstructedSystemPrompt(format: string): string {
  const parts = [
    `You are ManaTap AI — expert Magic: The Gathering deck designer for competitive ${format} (constructed, 60-card maindeck + 15-card sideboard).`,
    COMMANDER_FORBIDDEN,
    CONSTRUCTED_GOALS.replace(/\{FORMAT\}/g, format),
    `Respond ONLY with a single JSON object (no markdown fences, no commentary outside JSON).`,
    `Prefer recognizable archetype shells where possible (tier 2 competitive is OK if unsure — prioritize stability and cohesion over random brews).`,
    `Required JSON shape:`,
    `{
  "title": string,
  "colors": string[] (Mana symbols only: W,U,B,R,G e.g. ["R","B"] for Rakdos),
  "archetype": string,
  "mainboard": string[] (each entry "qty Card Name", quantities sum to exactly 60),
  "sideboard": string[] (each entry "qty Card Name", quantities sum to exactly 15; use [] only if impossible — prefer a full 15),
  "explanation": string[] (3–6 short bullets why this list works),
  "metaScore": number (0-100 integer; honest tiering estimate vs field),
  "confidence": number (0.00-1.00),
  "warnings": string[] (deck-building caveats; empty if none)
}`,
    `Pauper: only commons — deck must obey Pauper deckbuilding.`,
    `Use English card names exactly as printed on the English face.`,
  ];

  if (format === "Standard") {
    parts.splice(
      3,
      0,
      `Standard-specific: Anchor choices to the current Standard card pool and official ban list only. Prefer conservative, rotation-safe staples over famous older Constructed cards unless their Standard legality is certain.`
    );
  }

  return parts.join("\n\n");
}

/** Single repair round after validation strips cards or counts fall short — appended after assistant JSON. */
export function buildConstructedRepairRetryPrompt(input: ConstructedPromptInput): string {
  const cols =
    input.colors?.length && input.colors.some((c) => String(c || "").trim())
      ? input.colors.map((c) => String(c || "").trim()).filter(Boolean).join(", ")
      : null;

  const seed = input.seedPrompt;

  const lines = [
    `DECK REPAIR PASS — previous JSON lost too many cards during validation or counts were invalid.`,
    `Your previous output was too thin or failed validation. Return a complete legal list.`,
    `Reply with ONLY a JSON object using the exact same schema specified in the system message.`,
    `Hard requirements:`,
    `- Mainboard lines must sum to exactly 60 copies by quantity.`,
    `- Sideboard lines must sum to exactly 15 copies — prefer a full 15.`,
    `- Use only cards legal in ${input.format}; obey banned/restricted lists.`,
    ...(cols
      ? [`- Use only requested deck colors (${cols}); every card's color identity must stay within those colors — do not include off-color cards.`]
      : []),
    `- Do not mention card names in "explanation" unless those exact English printed names appear in mainboard or sideboard arrays.`,
    `- Do not mention cards in explanation that are not in the final decklist.`,
    ...(input.format === "Standard"
      ? [
          `- Standard: only include spells you are confident are legal in current Standard; prefer picks aligned with Scryfall legality validation.`,
        ]
      : []),
    `- Use conservative, currently legal card choices.`,
    ...(input.seedFromIdea?.title?.trim()
      ? [
          `- Stay coherent with the Manatap collection idea titled "${input.seedFromIdea.title.trim()}" and its stated archetype.`,
          ...(input.seedFromIdea.coreCards?.some((c) => String(c ?? "").trim())
            ? [
                `- Prioritize integrating these anchor cards wherever legal for ${input.format}: ${input.seedFromIdea!.coreCards!.slice(0, 24).map((x) => String(x ?? "").trim()).filter(Boolean).join(", ") || "(none)"}.`,
              ]
            : []),
        ]
      : []),
    ...(seed
      ? [
          "",
          `Seed shell (same as initial request — treat as starting core):`,
          `- Title hint: ${seed.titleHint}`,
          `- Archetype hint: ${seed.archetypeHint}`,
          `- Colors hint: ${seed.colorsHint.join(", ")}`,
          ...(seed.includeCardSeeds && (seed.mainboardSeedLines.length || seed.sideboardSeedLines.length)
            ? [
                `Validated legal seed lines — preserve these unless replacing with strictly better legal options:`,
                ...seed.mainboardSeedLines.map((l) => `  MAIN: ${l}`),
                ...seed.sideboardSeedLines.map((l) => `  SIDE: ${l}`),
                ...(seed.notes.length ? [`Notes:`, ...seed.notes.map((n) => `- ${n}`)] : []),
              ]
            : [`Guidance only (named seed cards failed validation filters — follow notes):`, ...seed.notes.map((n) => `- ${n}`)]),
        ]
      : []),
    `Output JSON only.`,
  ];

  return lines.join("\n");
}

export function buildConstructedUserPrompt(input: ConstructedPromptInput): string {
  const lines: string[] = [`Format: ${input.format}.`];

  if (input.colors?.length) {
    lines.push(`Preferred colors (guidance; stay coherent): ${input.colors.join(", ")}.`);
  } else {
    lines.push(`Colors: not specified — pick a coherent pair or shard that fits the archetype.`);
  }

  if (input.archetype?.trim()) {
    lines.push(`Archetype focus: ${input.archetype.trim()}.`);
  }

  const sf = input.seedFromIdea;
  if (sf?.title?.trim()) {
    const core = sf.coreCards?.map((x) => String(x ?? "").trim()).filter(Boolean) ?? [];
    const sfCols = sf.colors?.length
      ? ` Idea colors (guidance): ${sf.colors.filter(Boolean).join(", ")}.`
      : "";
    lines.push(
      `ManaTap selected deck idea: "${sf.title.trim()}". Build a complete ${input.format} 60+15 that realizes this deck concept faithfully.${sfCols}`,
      ...(sf.archetype?.trim() ? [`Idea archetype tag: ${sf.archetype.trim()}.`] : [])
    );
    if (core.length) {
      lines.push(`Priority picks from this idea — include heavily when coherent and legal (not exhaustive):`);
      lines.push(core.slice(0, 40).map((n) => `- ${n}`).join("\n"));
    }
  }

  const seed = input.seedPrompt;
  if (seed) {
    lines.push(
      `ManaTap constructed seed: use the following as a starting shell (prompt-only seed — expand into a full tournament deck).`,
      `Preserve legal seed cards while filling to exactly 60 mainboard and 15 sideboard copies unless a substitution is strictly better and clearly legal.`,
      `Suggested title hint: ${seed.titleHint}`,
      `Suggested archetype hint: ${seed.archetypeHint}`,
      `Suggested colors (ManaTap hint): ${seed.colorsHint.join(", ")}`
    );
    if (seed.includeCardSeeds && (seed.mainboardSeedLines.length > 0 || seed.sideboardSeedLines.length > 0)) {
      lines.push(
        `Validated legal seed shell — include these lines as part of your JSON mainboard/sideboard arrays (merge with additional cards as needed):`,
        ...seed.mainboardSeedLines.map((l) => `MAIN SEED: ${l}`),
        ...seed.sideboardSeedLines.map((l) => `SIDE SEED: ${l}`)
      );
    } else {
      lines.push(`Named seed cards did not all survive legality validation — follow archetype guidance instead:`);
      lines.push(...seed.notes.map((n) => `- ${n}`));
    }
    if (seed.includeCardSeeds && seed.notes.length > 0) {
      lines.push(`Additional shell notes:`);
      lines.push(...seed.notes.map((n) => `- ${n}`));
    }
    lines.push(
      input.format === "Standard"
        ? `Standard: prefer cards you can justify as Standard-legal today; when uncertain, choose conservative suites over nostalgic Constructed staples.`
        : `Fill curves and sideboard with ${input.format}-legal staples appropriate to the archetype.`
    );
  }

  const budget = input.budget ?? "balanced";
  lines.push(
    `Budget tier: ${budget} — ${
      budget === "budget"
        ? "prioritize accessible mana and affordable staples; avoid chase rares unless essential."
        : budget === "premium"
          ? "assume higher-end mana bases and format staples where they improve consistency."
          : "balanced costs — mix efficient staples with a few key upgrades."
    }`
  );

  const power = input.powerLevel ?? "strong";
  lines.push(
    `Power target: ${power} — ${
      power === "casual"
        ? "FNM-friendly but still coherent and legal."
        : power === "competitive"
          ? "aim for tournament-ready card choices and sideboard coverage."
          : "strong lists with good fundamentals."
    }`
  );

  if (input.ownedCards?.length) {
    lines.push(
      `The player owns these cards — prefer maximizing mainboard overlap with this pool when cohesive (prefer cards from both this list and priority idea anchors when both apply); you do not need to use every owned card:`
    );
    lines.push(input.ownedCards.slice(0, 80).map((n) => `- ${n}`).join("\n"));
  }

  if (input.notes?.trim()) {
    lines.push(`Additional notes: ${input.notes.trim()}`);
  }

  if (input.strictLegalityRetry) {
    lines.push(
      `CRITICAL RETRY: Previous output included cards not legal in ${input.format}. Replace illegal or unavailable cards with legal ${input.format} staples. Verify every card against ${input.format} legality and ban list. Keep total mainboard at 60 and sideboard at 15.`
    );
  }

  lines.push(`Output JSON only.`);

  return lines.join("\n\n");
}
