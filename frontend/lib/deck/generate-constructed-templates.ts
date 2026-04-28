/**
 * Prompt seeds for POST /api/deck/generate-constructed — not authoritative decklists.
 * Card rows are validated against Scryfall cache legalities before injection into prompts.
 */

import {
  filterRecommendationRowsByName,
  type FilterSuggestedNamesOptions,
} from "@/lib/deck/recommendation-legality";
import { totalDeckQty } from "@/lib/deck/generation-helpers";
import type { QtyRow } from "@/lib/deck/generate-constructed-post";

export type ConstructedSeedCard = { card: string; qty: number };

export type ConstructedSeedTemplate = {
  titleHint: string;
  archetypeHint: string;
  colorsHint: string[];
  mainboardSeed: ConstructedSeedCard[];
  sideboardSeed: ConstructedSeedCard[];
  notes: string[];
};

function normArch(s: string | undefined): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function colorLetters(colors: string[] | undefined): string[] {
  const out: string[] = [];
  const allowed = new Set(["W", "U", "B", "R", "G"]);
  for (const c of colors || []) {
    const letters = String(c || "")
      .toUpperCase()
      .replace(/[^WUBRG]/g, "");
    for (const ch of letters) {
      if (allowed.has(ch) && !out.includes(ch)) out.push(ch);
    }
  }
  return out;
}

/** Minimum total validated seed qty (main+side) before we inject named seed cards into the prompt. */
export const CONSTRUCTED_SEED_MIN_VALIDATED_QTY = 10;

function pioneerMonoGreenRamp(): ConstructedSeedTemplate {
  return {
    titleHint: "Mono-Green Ramp",
    archetypeHint: "Ramp into large creatures / devotion payoffs",
    colorsHint: ["G"],
    mainboardSeed: [
      { card: "Forest", qty: 12 },
      { card: "Llanowar Elves", qty: 4 },
      { card: "Elvish Mystic", qty: 4 },
      { card: "Old-Growth Troll", qty: 4 },
      { card: "Wolfwillow Haven", qty: 4 },
    ],
    sideboardSeed: [
      { card: "Scavenging Ooze", qty: 2 },
      { card: "Back to Nature", qty: 2 },
    ],
    notes: [
      "Pioneer mono-green shell: curve creatures + mana dorks; finish with top-end bombs legal in Pioneer.",
      "Adjust creature mix to metagame — keep curve coherent.",
    ],
  };
}

/** Standard Azorius — conservative basics + guidance; named spells kept minimal so rotation cannot invalidate the seed text. */
function standardWuControl(): ConstructedSeedTemplate {
  return {
    titleHint: "Azorius Control",
    archetypeHint: "Counters, sweepers, card advantage, finishing closers",
    colorsHint: ["W", "U"],
    mainboardSeed: [
      { card: "Island", qty: 8 },
      { card: "Plains", qty: 6 },
    ],
    sideboardSeed: [],
    notes: [
      "Standard Azorius control: build ~22–26 lands including duals / pathways / utility lands that are legal in current Standard only.",
      "Fill interaction with Standard-legal removal and counters — verify every non-basic spell against the live ban list and rotation.",
      "Prefer conservative picks supported by Scryfall legality data over nostalgic Constructed staples from older eras.",
    ],
  };
}

function modernBrMidrange(): ConstructedSeedTemplate {
  return {
    titleHint: "Rakdos Midrange",
    archetypeHint: "Efficient removal, hand disruption, curve creatures",
    colorsHint: ["B", "R"],
    mainboardSeed: [
      { card: "Lightning Bolt", qty: 4 },
      { card: "Thoughtseize", qty: 4 },
      { card: "Blood Crypt", qty: 4 },
      { card: "Blackcleave Cliffs", qty: 4 },
      { card: "Fatal Push", qty: 4 },
    ],
    sideboardSeed: [
      { card: "Unlicensed Hearse", qty: 2 },
      { card: "Engineered Explosives", qty: 1 },
      { card: "Blood Moon", qty: 2 },
    ],
    notes: [
      "Modern Rakdos midrange backbone — flesh out with creatures and planeswalkers appropriate to the metagame.",
    ],
  };
}

function pauperBurn(): ConstructedSeedTemplate {
  return {
    titleHint: "Mono-Red Burn",
    archetypeHint: "Fast burn spells backed by efficient creatures",
    colorsHint: ["R"],
    mainboardSeed: [
      { card: "Mountain", qty: 18 },
      { card: "Lightning Bolt", qty: 4 },
      { card: "Chain Lightning", qty: 4 },
      { card: "Skewer the Critics", qty: 4 },
      { card: "Thermo-Alchemist", qty: 4 },
    ],
    sideboardSeed: [
      { card: "Red Elemental Blast", qty: 3 },
      { card: "Smash to Smithereens", qty: 3 },
    ],
    notes: [
      "Pauper burn curve — only commons; verify sideboard slots vs expected hate.",
    ],
  };
}

/**
 * Resolve a seed template from format/colors/archetype (prompt hints only).
 */
export function getConstructedSeedTemplate(input: {
  format: "Modern" | "Pioneer" | "Standard" | "Pauper";
  colors?: string[];
  archetype?: string;
  budget?: string;
}): ConstructedSeedTemplate | null {
  const fmt = input.format;
  const arch = normArch(input.archetype);
  const cols = colorLetters(input.colors);

  if (fmt === "Standard" && cols.includes("W") && cols.includes("U") && cols.length <= 2) {
    if (/\bcontrol\b|azorius|uw\b/.test(arch) || arch.includes("control")) {
      return standardWuControl();
    }
  }

  if (fmt === "Pioneer" && cols.length === 1 && cols[0] === "G") {
    if (/\bramp\b|mono.?green|stompy|devotion/.test(arch) || arch.includes("ramp")) {
      return pioneerMonoGreenRamp();
    }
  }

  if (fmt === "Modern" && cols.includes("B") && cols.includes("R") && cols.length === 2) {
    if (/\bmidrange\b|rakdos|\brb\b/.test(arch)) {
      return modernBrMidrange();
    }
  }

  if (fmt === "Pauper" && cols.length === 1 && cols[0] === "R") {
    if (/\bburn\b|mono.?red/.test(arch) || arch.includes("burn")) {
      return pauperBurn();
    }
  }

  return null;
}

export type ValidatedConstructedSeed = {
  template: ConstructedSeedTemplate;
  mainRows: QtyRow[];
  sideRows: QtyRow[];
  /** Rows removed by legality filter + qty sums */
  removalCount: number;
  rawMainQty: number;
  rawSideQty: number;
  validatedMainQty: number;
  validatedSideQty: number;
  /** When true, prompt should still list validated seed lines */
  includeCardSeedsInPrompt: boolean;
};

function rowsFromSeed(cards: ConstructedSeedCard[]): QtyRow[] {
  return cards.map((c) => ({
    name: String(c.card || "").trim(),
    qty: Math.min(99, Math.max(0, Math.floor(Number(c.qty) || 0))),
  }));
}

/**
 * Drop illegal / unknown template cards using the same path as decklist filtering.
 * Never inject unvalidated names into prompts.
 */
export async function validateConstructedSeedTemplate(
  formatLabel: string,
  template: ConstructedSeedTemplate,
  opts?: FilterSuggestedNamesOptions
): Promise<ValidatedConstructedSeed> {
  const mainIn = rowsFromSeed(template.mainboardSeed);
  const sideIn = rowsFromSeed(template.sideboardSeed);

  const rawMainQty = totalDeckQty(mainIn);
  const rawSideQty = totalDeckQty(sideIn);

  const fm = await filterRecommendationRowsByName(mainIn, formatLabel, {
    logPrefix: "/api/deck/generate-constructed seed main",
    ...(opts ?? {}),
  });
  const fs = await filterRecommendationRowsByName(sideIn, formatLabel, {
    logPrefix: "/api/deck/generate-constructed seed side",
    ...(opts ?? {}),
  });

  const removalCount = fm.removed.length + fs.removed.length;
  const validatedMainQty = totalDeckQty(fm.allowed);
  const validatedSideQty = totalDeckQty(fs.allowed);

  const totalValidatedQty = validatedMainQty + validatedSideQty;
  const includeCardSeedsInPrompt =
    totalValidatedQty >= CONSTRUCTED_SEED_MIN_VALIDATED_QTY && fm.allowed.length + fs.allowed.length > 0;

  return {
    template,
    mainRows: fm.allowed,
    sideRows: fs.allowed,
    removalCount,
    rawMainQty,
    rawSideQty,
    validatedMainQty,
    validatedSideQty,
    includeCardSeedsInPrompt,
  };
}

/** Format seed rows as AI deck lines ("qty Name"). */
export function seedRowsToPromptLines(rows: QtyRow[]): string[] {
  return rows.filter((r) => r.name && r.qty > 0).map((r) => `${r.qty} ${r.name}`);
}

/** Serialized slice passed into {@link buildConstructedUserPrompt} / repair prompts. */
export type ConstructedSeedPromptPayload = {
  titleHint: string;
  archetypeHint: string;
  colorsHint: string[];
  mainboardSeedLines: string[];
  sideboardSeedLines: string[];
  notes: string[];
  includeCardSeeds: boolean;
};

export function buildConstructedSeedPromptPayload(v: ValidatedConstructedSeed): ConstructedSeedPromptPayload {
  const t = v.template;
  return {
    titleHint: t.titleHint,
    archetypeHint: t.archetypeHint,
    colorsHint: t.colorsHint,
    mainboardSeedLines: v.includeCardSeedsInPrompt ? seedRowsToPromptLines(v.mainRows) : [],
    sideboardSeedLines: v.includeCardSeedsInPrompt ? seedRowsToPromptLines(v.sideRows) : [],
    notes: t.notes,
    includeCardSeeds: v.includeCardSeedsInPrompt,
  };
}
