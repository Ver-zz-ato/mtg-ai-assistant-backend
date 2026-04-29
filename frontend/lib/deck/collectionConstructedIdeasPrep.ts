/**
 * Sampling + normalization for POST /api/deck/collection-constructed-ideas.
 * Keeps the route handler readable; deterministic priority order for large collections.
 */

import { normalizeScryfallCacheName, deriveTypeFlagsFromTypeLine } from "@/lib/server/scryfallCacheRow";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { filterSuggestedCardNamesForFormat } from "@/lib/deck/recommendation-legality";

export const LEGAL_OWNED_CARD_MINIMUM = 20;
/** Cap for owned-card lines in the ideas prompt (smaller = more reliable JSON from the model). */
export const COLLECTION_PROMPT_CARD_CAP = 560;

export type AggregatedRow = { displayName: string; qty: number; normKey: string };

/**
 * Merge duplicate-normalized rows; sum qty, keep first printable name.
 */
export function aggregateCollectionQtyRows(rows: Array<{ name: string; qty: number | null }>): AggregatedRow[] {
  const map = new Map<string, AggregatedRow>();
  for (const r of rows) {
    const raw = String(r.name ?? "").trim();
    if (!raw) continue;
    const nk = normalizeScryfallCacheName(raw);
    const q = Math.max(1, Number(r.qty) || 1);
    const prev = map.get(nk);
    if (!prev) {
      map.set(nk, { displayName: raw, qty: Math.min(99, q), normKey: nk });
    } else {
      prev.qty = Math.min(99, prev.qty + q);
    }
  }
  return Array.from(map.values());
}

/** Stable sort before legality filtering: qty desc → name asc. */
function sortMergedPreLegality(rows: AggregatedRow[]): AggregatedRow[] {
  return [...rows].sort((a, b) => {
    if (b.qty !== a.qty) return b.qty - a.qty;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Filter to format-legal names, then sort by qty desc, nonlands first, name asc.
 * Returns [] if fewer than {@link LEGAL_OWNED_CARD_MINIMUM} legal names.
 */
async function orderLegalNamesForPrompt(sortedRows: AggregatedRow[], formatLabel: string): Promise<string[]> {
  const namesInOrder = sortedRows.map((r) => r.displayName);
  const { allowed: legalOrdered } = await filterSuggestedCardNamesForFormat(namesInOrder, formatLabel);
  if (legalOrdered.length < LEGAL_OWNED_CARD_MINIMUM) {
    return [];
  }

  const rowByNorm = new Map(sortedRows.map((r) => [r.normKey, r] as const));
  const details = await getDetailsForNamesCached([...new Set(legalOrdered)]);

  type En = AggregatedRow & { isLandPri: number };
  const enriched: En[] = [];
  for (const display of legalOrdered) {
    const nk = normalizeScryfallCacheName(display);
    const agg = rowByNorm.get(nk);
    if (!agg) continue;

    let d: unknown = details.get(nk);
    if (!d) {
      for (const [k, v] of details.entries()) {
        if (normalizeScryfallCacheName(k) === nk) {
          d = v;
          break;
        }
      }
    }
    const tl =
      d && typeof d === "object" && typeof (d as { type_line?: string }).type_line === "string"
        ? (d as { type_line: string }).type_line
        : "";
    const flags = deriveTypeFlagsFromTypeLine(tl || null);
    const isLandPri = flags.is_land === true ? 1 : 0;
    enriched.push({ ...agg, isLandPri });
  }

  enriched.sort((a, b) => {
    if (b.qty !== a.qty) return b.qty - a.qty;
    if (a.isLandPri !== b.isLandPri) return a.isLandPri - b.isLandPri;
    return a.displayName.localeCompare(b.displayName);
  });

  return enriched.map((e) => e.displayName);
}

/** Returns prompt lines (display names, qty capped) plus sample size meta. */
export async function preparePromptCardSample(
  aggregated: AggregatedRow[],
  formatLabel: string,
): Promise<{
  ok: true;
  promptLines: string;
  sampledNamesOrdered: string[];
  collectionSampleSize: number;
  ownerNormKeys: Set<string>;
  ownerNormToDisplay: Map<string, string>;
  qtyByNormKey: Map<string, number>;
} | { ok: false; reason: "not_enough_legal" }> {
  const qtyByNormKey = new Map<string, number>(aggregated.map((r) => [r.normKey, r.qty] as const));
  const ownerNormToDisplay = new Map<string, string>();
  for (const r of aggregated) {
    if (!ownerNormToDisplay.has(r.normKey)) ownerNormToDisplay.set(r.normKey, r.displayName);
  }

  const preSorted = sortMergedPreLegality(aggregated);
  const orderedLegalNames = await orderLegalNamesForPrompt(preSorted, formatLabel);
  if (orderedLegalNames.length === 0) {
    return { ok: false, reason: "not_enough_legal" };
  }

  const ownerNormKeys = new Set<string>(aggregated.map((r) => r.normKey));

  const linesInSample = orderedLegalNames.slice(0, COLLECTION_PROMPT_CARD_CAP);
  const promptLines = linesInSample
    .map((n) => {
      const nk = normalizeScryfallCacheName(n);
      const qty = qtyByNormKey.get(nk) ?? 1;
      return `- ${n} ×${qty}`;
    })
    .join("\n");

  return {
    ok: true,
    promptLines,
    sampledNamesOrdered: linesInSample,
    collectionSampleSize: linesInSample.length,
    ownerNormKeys,
    ownerNormToDisplay,
    qtyByNormKey,
  };
}
