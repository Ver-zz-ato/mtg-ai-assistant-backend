import type { AnalyzeFormat, DeckFormatCanonical } from "./formatRules";

export type FormatSupportLevel = "full" | "limited";

export type FormatSupportKey =
  | DeckFormatCanonical
  | "legacy"
  | "vintage"
  | "brawl"
  | "historic";

export type FormatSupportEntry = {
  key: FormatSupportKey;
  label: string;
  aliases: string[];
  supportLevel: FormatSupportLevel;
  importParsing: boolean;
  legality: boolean;
  aiAnalysis: boolean;
  roast: boolean;
  costToFinish: boolean;
  mulligan: boolean;
  sideboardAware: boolean;
  commanderLogic: boolean;
  notes: string;
};

export const FORMAT_SUPPORT_MATRIX: Record<FormatSupportKey, FormatSupportEntry> = {
  commander: {
    key: "commander",
    label: "Commander",
    aliases: ["edh", "cedh"],
    supportLevel: "full",
    importParsing: true,
    legality: true,
    aiAnalysis: true,
    roast: true,
    costToFinish: true,
    mulligan: true,
    sideboardAware: false,
    commanderLogic: true,
    notes: "Flagship format. Commander color identity and singleton assumptions are first-class.",
  },
  modern: {
    key: "modern",
    label: "Modern",
    aliases: ["mod"],
    supportLevel: "full",
    importParsing: true,
    legality: true,
    aiAnalysis: true,
    roast: true,
    costToFinish: true,
    mulligan: true,
    sideboardAware: true,
    commanderLogic: false,
    notes: "Full 60-card constructed support with sideboard-aware parsing in deck cost and analysis flows.",
  },
  pioneer: {
    key: "pioneer",
    label: "Pioneer",
    aliases: ["pio"],
    supportLevel: "full",
    importParsing: true,
    legality: true,
    aiAnalysis: true,
    roast: true,
    costToFinish: true,
    mulligan: true,
    sideboardAware: true,
    commanderLogic: false,
    notes: "Full 60-card constructed support with sideboard-aware parsing in deck cost and analysis flows.",
  },
  standard: {
    key: "standard",
    label: "Standard",
    aliases: ["std"],
    supportLevel: "full",
    importParsing: true,
    legality: true,
    aiAnalysis: true,
    roast: true,
    costToFinish: true,
    mulligan: true,
    sideboardAware: true,
    commanderLogic: false,
    notes: "Full 60-card constructed support with sideboard-aware parsing in deck cost and analysis flows.",
  },
  pauper: {
    key: "pauper",
    label: "Pauper",
    aliases: ["pp"],
    supportLevel: "full",
    importParsing: true,
    legality: true,
    aiAnalysis: true,
    roast: true,
    costToFinish: true,
    mulligan: true,
    sideboardAware: true,
    commanderLogic: false,
    notes: "Verified alongside the same constructed paths as Modern/Pioneer/Standard; roast and mulligan already accept Pauper.",
  },
  legacy: {
    key: "legacy",
    label: "Legacy",
    aliases: [],
    supportLevel: "limited",
    importParsing: true,
    legality: true,
    aiAnalysis: false,
    roast: false,
    costToFinish: false,
    mulligan: false,
    sideboardAware: false,
    commanderLogic: false,
    notes: "Legality key exists, but deck analysis, roast, and cost flows are not first-class yet.",
  },
  vintage: {
    key: "vintage",
    label: "Vintage",
    aliases: [],
    supportLevel: "limited",
    importParsing: true,
    legality: true,
    aiAnalysis: false,
    roast: false,
    costToFinish: false,
    mulligan: false,
    sideboardAware: false,
    commanderLogic: false,
    notes: "Legality key exists, but deck analysis, roast, and cost flows are not first-class yet.",
  },
  brawl: {
    key: "brawl",
    label: "Brawl",
    aliases: [],
    supportLevel: "limited",
    importParsing: true,
    legality: true,
    aiAnalysis: false,
    roast: false,
    costToFinish: false,
    mulligan: false,
    sideboardAware: false,
    commanderLogic: true,
    notes: "Legality and commander-style color identity mapping exist, but analysis and tool surfaces are not first-class yet.",
  },
  historic: {
    key: "historic",
    label: "Historic",
    aliases: [],
    supportLevel: "limited",
    importParsing: true,
    legality: true,
    aiAnalysis: false,
    roast: false,
    costToFinish: false,
    mulligan: false,
    sideboardAware: false,
    commanderLogic: false,
    notes: "Legality key exists, but analysis and supporting tool surfaces are not first-class yet.",
  },
};

const FORMAT_ALIAS_TO_KEY = new Map<string, FormatSupportKey>();

for (const entry of Object.values(FORMAT_SUPPORT_MATRIX)) {
  FORMAT_ALIAS_TO_KEY.set(entry.key, entry.key);
  FORMAT_ALIAS_TO_KEY.set(entry.label.toLowerCase(), entry.key);
  for (const alias of entry.aliases) {
    FORMAT_ALIAS_TO_KEY.set(alias.toLowerCase(), entry.key);
  }
}

FORMAT_ALIAS_TO_KEY.set("duel commander", "commander");
FORMAT_ALIAS_TO_KEY.set("duel", "commander");

export const FIRST_CLASS_FORMAT_KEYS = [
  "commander",
  "modern",
  "pioneer",
  "standard",
  "pauper",
] as const satisfies readonly FormatSupportKey[];

export function normalizeFormatSupportKey(input: string | null | undefined): FormatSupportKey | null {
  const normalized = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!normalized) return null;
  return FORMAT_ALIAS_TO_KEY.get(normalized) ?? null;
}

export function getFormatSupportEntry(input: string | FormatSupportKey | null | undefined): FormatSupportEntry | null {
  const key = normalizeFormatSupportKey(typeof input === "string" ? input : input ?? undefined);
  return key ? FORMAT_SUPPORT_MATRIX[key] : null;
}

export function isFirstClassFormat(input: string | FormatSupportKey | null | undefined): boolean {
  const entry = getFormatSupportEntry(input);
  return entry?.supportLevel === "full";
}

export function isFirstClassAnalyzeFormat(input: string | FormatSupportKey | null | undefined): input is DeckFormatCanonical {
  const key = normalizeFormatSupportKey(typeof input === "string" ? input : input ?? undefined);
  return !!key && (FIRST_CLASS_FORMAT_KEYS as readonly string[]).includes(key);
}

export function tryFormatSupportKeyToAnalyzeFormat(
  input: string | FormatSupportKey | null | undefined
): AnalyzeFormat | null {
  const key = normalizeFormatSupportKey(typeof input === "string" ? input : input ?? undefined);
  if (!key || !(FIRST_CLASS_FORMAT_KEYS as readonly string[]).includes(key)) return null;
  const label = FORMAT_SUPPORT_MATRIX[key].label;
  return label as AnalyzeFormat;
}

export function getLimitedSupportNote(input: string | FormatSupportKey | null | undefined): string | null {
  const entry = getFormatSupportEntry(input);
  if (!entry || entry.supportLevel === "full") return null;
  return `${entry.label} has limited support right now. Import and legality helpers may work, but deeper AI analysis and tool flows are not first-class yet.`;
}
