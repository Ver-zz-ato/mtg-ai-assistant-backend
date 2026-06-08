import type { AiWorkshopDiffRow } from "./ai-workshop-deck-text";
import { buildAiWorkshopDiffKey } from "./ai-workshop-deck-text";

export type CardChangeReasons = {
  added?: Record<string, string>;
  removed?: Record<string, string>;
};

export function detectCommander(text: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (/^commander/i.test(lines[i].trim()) && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      const match = next.match(/^(\d+)x?\s+(.+)$/i);
      return match ? match[2].trim() : next;
    }
  }
  return null;
}

/** First deck line or explicit Commander section — matches budget-swaps / cost-to-finish. */
export function deriveCommanderFromDeckText(text: string, title = ""): string {
  const labeled = detectCommander(text);
  if (labeled) return labeled;
  const first = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || title;
  const match = first.match(/^(\d+)\s*[xX]?\s+(.+)$/);
  return (match ? match[2] : first).replace(/\s*\(.*?\)\s*$/, "").trim();
}

function cleanCardNameForArt(name: string): string {
  return String(name || "").replace(/\s*\(.*?\)\s*$/, "").trim();
}

/** Candidate card names for deck banner art (commander, title, first lines). */
export function collectDeckArtCandidateNames(text: string, commander: string, title = ""): string[] {
  const list: string[] = [];
  if (commander) list.push(cleanCardNameForArt(commander));
  if (title && title !== "Untitled deck") list.push(cleanCardNameForArt(title));
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 5);
  for (const line of lines) {
    const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    list.push(cleanCardNameForArt(match ? match[2] : line));
  }
  return [...new Set(list.filter(Boolean))];
}

function normCardName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickArtFromImageMap(
  candidates: string[],
  imageMap: Map<string, { art_crop?: string; normal?: string; small?: string }>,
): string | null {
  for (const name of candidates) {
    const img = imageMap.get(normCardName(name));
    const url = img?.art_crop || img?.normal || img?.small;
    if (url) return url;
  }
  return null;
}

export function filterSelectedChangeReasons(args: {
  reasons: CardChangeReasons | null | undefined;
  adds: AiWorkshopDiffRow[];
  cuts: AiWorkshopDiffRow[];
  selectedAddKeys: Set<string>;
  selectedCutKeys: Set<string>;
}): CardChangeReasons | null {
  if (!args.reasons) return null;
  const added = args.adds.reduce<Record<string, string>>((acc, row) => {
    const key = buildAiWorkshopDiffKey(row);
    const reason = args.reasons?.added?.[row.name.trim().toLowerCase()];
    if (args.selectedAddKeys.has(key) && reason) acc[row.name.trim().toLowerCase()] = reason;
    return acc;
  }, {});
  const removed = args.cuts.reduce<Record<string, string>>((acc, row) => {
    const key = buildAiWorkshopDiffKey(row);
    const reason = args.reasons?.removed?.[row.name.trim().toLowerCase()];
    if (args.selectedCutKeys.has(key) && reason) acc[row.name.trim().toLowerCase()] = reason;
    return acc;
  }, {});
  if (!Object.keys(added).length && !Object.keys(removed).length) return null;
  return {
    ...(Object.keys(added).length ? { added } : {}),
    ...(Object.keys(removed).length ? { removed } : {}),
  };
}

export function findCountMismatchWarning(warnings: string[] | null | undefined): string | null {
  if (!warnings?.length) return null;
  return (
    warnings.find((warning) => /list has \d+ cards after validation; target is \d+/i.test(warning)) ??
    warnings.find((warning) => /target is \d+/i.test(warning)) ??
    null
  );
}

export function isCountMismatchWarning(warning: string): boolean {
  return (
    /list has \d+ cards after validation; target is \d+/i.test(warning) ||
    /target is \d+/i.test(warning)
  );
}

export function normalizeChangeReasons(value: unknown): CardChangeReasons | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const normalizeBucket = (bucket: unknown): Record<string, string> | undefined => {
    if (!bucket || typeof bucket !== "object") return undefined;
    const out: Record<string, string> = {};
    for (const [key, reason] of Object.entries(bucket as Record<string, unknown>)) {
      if (!key.trim() || typeof reason !== "string" || !reason.trim()) continue;
      out[key.trim().toLowerCase()] = reason.trim();
    }
    return Object.keys(out).length ? out : undefined;
  };
  const added = normalizeBucket(source.added);
  const removed = normalizeBucket(source.removed);
  if (!added && !removed) return null;
  return { added, removed };
}

export function normalizeSourceChip(sourceLabel: string): string {
  const lower = sourceLabel.trim().toLowerCase();
  if (lower.includes("precon")) return "Precon";
  if (lower.includes("sample")) return "Sample deck";
  if (lower.includes("public")) return "Public deck";
  if (lower.includes("starter")) return "Starter";
  if (lower.includes("featured")) return "Featured deck";
  if (lower.includes("import")) return "Imported";
  return "Loaded deck";
}

export function normalizeColorIdentity(colorsList: string[] | null | undefined): string | null {
  if (!colorsList?.length) return null;
  const clean = colorsList
    .map((entry) => String(entry ?? "").trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 5);
  return clean.length ? clean.join(" · ") : null;
}

export function isBasicLandName(name: string): boolean {
  return /^(plains|island|swamp|mountain|forest|wastes)$/i.test(name.trim());
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(2)}`;
}
