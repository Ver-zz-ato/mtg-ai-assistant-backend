/**
 * Prompts for 60-card competitive constructed formats (Modern, Pioneer, Standard, Pauper).
 * Intentionally different from Commander: tournament Magic, copies, curve, sideboard, legality.
 */

export type ConstructedBudget = "budget" | "balanced" | "premium";
export type ConstructedPower = "casual" | "strong" | "competitive";

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
  return [
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
  ].join("\n\n");
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
    lines.push(`The player owns these cards — prefer including several when they fit (not mandatory to use all):`);
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
