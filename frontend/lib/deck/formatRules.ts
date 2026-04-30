/**
 * Central format rules for deck builder + analysis (Phase 1).
 * Not a full legality engine — targets and copy limits for UX + AI context.
 */

export const DECK_FORMATS = [
  "commander",
  "modern",
  "pioneer",
  "standard",
  "pauper",
] as const;

export type DeckFormatCanonical = (typeof DECK_FORMATS)[number];

/** Titled strings used by /api/deck/analyze and inferDeckContext. */
export type AnalyzeFormat = "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper";

export const FORMAT_LABEL: Record<DeckFormatCanonical, string> = {
  commander: "Commander",
  modern: "Modern",
  pioneer: "Pioneer",
  standard: "Standard",
  pauper: "Pauper",
};

export type FormatRules = {
  canonical: DeckFormatCanonical;
  analyzeAs: AnalyzeFormat;
  mainDeckTarget: number;
  minMainDeckCards: number;
  maxCopies: number;
  commanderRequired: boolean;
  sideboardEnabled: boolean;
  maxSideboardCards: number;
  colorIdentityApplies: boolean;
};

const SINGLETON_EXCEPTIONS = new Set([
  "Relentless Rats",
  "Rat Colony",
  "Shadowborn Apostle",
  "Persistent Petitioners",
  "Dragon's Approach",
  "Nazgûl",
]);

const BASIC_LAND_NAMES = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

function rulesFor(canonical: DeckFormatCanonical, analyzeAs: AnalyzeFormat): FormatRules {
  if (canonical === "commander") {
    return {
      canonical,
      analyzeAs,
      mainDeckTarget: 100,
      minMainDeckCards: 100,
      maxCopies: 1,
      commanderRequired: true,
      sideboardEnabled: false,
      maxSideboardCards: 0,
      colorIdentityApplies: true,
    };
  }
  return {
    canonical,
    analyzeAs,
    mainDeckTarget: 60,
    minMainDeckCards: 60,
    maxCopies: 4,
    commanderRequired: false,
    sideboardEnabled: true,
    maxSideboardCards: 15,
    colorIdentityApplies: false,
  };
}

const RULES_TABLE: Record<DeckFormatCanonical, FormatRules> = {
  commander: rulesFor("commander", "Commander"),
  modern: rulesFor("modern", "Modern"),
  pioneer: rulesFor("pioneer", "Pioneer"),
  standard: rulesFor("standard", "Standard"),
  pauper: rulesFor("pauper", "Pauper"),
};

/**
 * Normalize user / DB / API input to a canonical format key, or null if unknown.
 */
export function normalizeDeckFormat(input: string | null | undefined): DeckFormatCanonical | null {
  const s = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!s) return null;
  if (s === "commander" || s === "edh" || s === "cedh") return "commander";
  if (s === "modern" || s === "mod") return "modern";
  if (s === "pioneer" || s === "pio") return "pioneer";
  if (s === "standard" || s === "std") return "standard";
  if (s === "pauper" || s === "pp") return "pauper";
  return null;
}

/**
 * Map canonical format to API/inference TitleCase label.
 */
export function toAnalyzeFormat(canonical: DeckFormatCanonical | null | undefined): AnalyzeFormat {
  const c = canonical && RULES_TABLE[canonical] ? canonical : "commander";
  return RULES_TABLE[c].analyzeAs;
}

/**
 * String from DB (e.g. "pioneer") -> AnalyzeFormat for LLM and inferDeckContext.
 */
export function deckFormatStringToAnalyzeFormat(
  format: string | null | undefined
): AnalyzeFormat {
  const n = normalizeDeckFormat(format);
  if (n) return toAnalyzeFormat(n);
  return "Commander";
}

export function getFormatRules(
  format: string | null | undefined
): FormatRules {
  const n = normalizeDeckFormat(format);
  if (n) return { ...RULES_TABLE[n] };
  return { ...RULES_TABLE.commander };
}

export function isCommanderFormatString(format: string | null | undefined): boolean {
  return normalizeDeckFormat(format) === "commander";
}

export function isConstructed60Format(format: string | null | undefined): boolean {
  const n = normalizeDeckFormat(format);
  return n != null && n !== "commander";
}

/** Singleton rule exceptions (Commander) — same as SingletonViolationBanner. */
export function isSingletonExceptionCardName(name: string): boolean {
  return SINGLETON_EXCEPTIONS.has(name);
}

export function isBasicLandName(name: string): boolean {
  return BASIC_LAND_NAMES.has(String(name || "").trim().toLowerCase());
}

export type CopyCountViolation = {
  name: string;
  qty: number;
  maxAllowed: number;
};

/**
 * Return copy-count issues for the main deck (or all rows if zones not used).
 * Commander: qty > 1 for non-basic, non-exception.
 * Constructed: qty > 4 for non-basic, non-exception.
 */
export function getCopyCountViolations(
  rows: Array<{ name: string; qty: number }>,
  format: string | null | undefined
): CopyCountViolation[] {
  const rules = getFormatRules(format);
  const out: CopyCountViolation[] = [];
  for (const r of rows) {
    const name = String(r.name || "").trim();
    const qty = Math.max(0, Math.floor(Number(r.qty) || 0));
    if (qty <= 0) continue;
    if (isBasicLandName(name)) continue;
    if (rules.maxCopies === 1 && isSingletonExceptionCardName(name)) continue;
    if (qty > rules.maxCopies) {
      out.push({ name, qty, maxAllowed: rules.maxCopies });
    }
  }
  return out;
}

/**
 * Public deck / compliance: count mainboard (+ commander zone) cards only, not sideboard.
 * Rows without `zone` count as mainboard (pre-migration / legacy).
 */
export function getMainboardCardCount(
  rows: Array<{ qty: number; zone?: string | null }>
): number {
  let sum = 0;
  for (const r of rows) {
    const z = String(r.zone || "mainboard").toLowerCase();
    if (z === "sideboard") continue;
    sum += Math.max(0, Math.floor(Number(r.qty) || 0));
  }
  return sum;
}

export function getSideboardCardCount(
  rows: Array<{ qty: number; zone?: string | null }>
): number {
  let sum = 0;
  for (const r of rows) {
    if (String(r.zone || "mainboard").toLowerCase() !== "sideboard") continue;
    sum += Math.max(0, Math.floor(Number(r.qty) || 0));
  }
  return sum;
}

/** Finish This Deck modal: targets aligned with FormatCardCountBanner / formatCompliance. */
export function getFinishDeckModalCounts(
  format: string | null | undefined,
  mainboardCardCount: number
): {
  targetTotal: number;
  needed: number;
  analyzeLabel: AnalyzeFormat;
} {
  const rules = getFormatRules(format);
  const targetTotal = rules.mainDeckTarget;
  const needed = Math.max(0, targetTotal - mainboardCardCount);
  return { targetTotal, needed, analyzeLabel: rules.analyzeAs };
}
