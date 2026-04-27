/**
 * Deck quantity aggregation for /api/collections/cost — shared between handler logic and tests.
 */
import { canonicalize } from "@/lib/cards/canonicalize";
import { parseDeckTextWithZones } from "@/lib/deck/parseDeckText";
import { FORMAT_LABEL, isCommanderFormatString, normalizeDeckFormat } from "@/lib/deck/formatRules";

export type DeckQtyAgg = { total: number; main: number; side: number };

/** Lowercase canonical-ish key used for collection matching + pricing rows (matches existing cost route). */
export function normalizeNameToCanonKey(raw: string): { key: string; canon: string } {
  const s = String(raw || "").trim();
  if (!s) return { key: "", canon: "" };
  const basic = s
    .replace(/[,·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const { canonicalName } = canonicalize(basic);
  const canon = canonicalName || basic;
  const key = canon.toLowerCase();
  return { key, canon };
}

/**
 * Per-card quantities from deck text with Mainboard/Sideboard zoning when applicable.
 * Keys are {@link normalizeNameToCanonKey}`().key`.
 */
export function aggregateDeckQuantitiesByCanonKey(
  deckText: string,
  formatHint: string | undefined,
): Map<string, DeckQtyAgg> {
  const map = new Map<string, DeckQtyAgg>();
  const useCmd =
    typeof formatHint === "string" &&
    formatHint.trim().length > 0 &&
    isCommanderFormatString(formatHint.trim());
  const entries = parseDeckTextWithZones(deckText, { isCommanderFormat: useCmd });
  for (const e of entries) {
    const norm = normalizeNameToCanonKey(e.name);
    if (!norm.key) continue;
    const isSide = String(e.zone || "mainboard").toLowerCase() === "sideboard";
    const prev = map.get(norm.key) ?? { total: 0, main: 0, side: 0 };
    const q = Math.max(0, Math.floor(Number(e.qty) || 0));
    prev.total += q;
    if (isSide) prev.side += q;
    else prev.main += q;
    map.set(norm.key, prev);
  }
  return map;
}

/** Single-zone rows only; mixed main+side for the same card name → unknown (safe default). */
export function resolveDeckLineZone(agg: DeckQtyAgg): "mainboard" | "sideboard" | "unknown" {
  if (agg.main > 0 && agg.side > 0) return "unknown";
  if (agg.main > 0) return "mainboard";
  if (agg.side > 0) return "sideboard";
  return "unknown";
}

/** Display label for optional metadata: canonical FORMAT_LABEL when recognized, else trimmed input. */
export function normalizedFormatMetadataLabel(formatHint: string | undefined): string | undefined {
  if (typeof formatHint !== "string" || !formatHint.trim()) return undefined;
  const t = formatHint.trim();
  const n = normalizeDeckFormat(t);
  if (n) return FORMAT_LABEL[n];
  return t;
}
