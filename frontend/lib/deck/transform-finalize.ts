import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { norm, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";
import {
  getFormatRules,
  isBasicLandName,
  isSingletonExceptionCardName,
} from "@/lib/deck/formatRules";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { filterDecklistQtyRowsForFormat, type FilterSuggestedNamesOptions } from "@/lib/deck/recommendation-legality";

export type QtyRow = { name: string; qty: number };

type CardDetailsRow = { legalities?: Record<string, string> | null; color_identity?: string[] };

export type FinalizeTransformRowsArgs = {
  rows: QtyRow[];
  sourceRows: QtyRow[];
  targetCount: number;
  analyzeFormat: string;
  isCommander: boolean;
  commanderName: string | null;
  allowedColors: string[];
  warnings?: string[];
  avoidRefillCards?: string[];
  getCardDetails?: (names: string[]) => Promise<Map<string, CardDetailsRow>>;
  filterRowsForFormat?: (
    rows: QtyRow[],
    userFormat: string,
    opts?: FilterSuggestedNamesOptions
  ) => Promise<{ lines: QtyRow[]; removed: Array<{ name: string; reason: string }> }>;
};

function normalizeRows(rows: QtyRow[]): QtyRow[] {
  const out = new Map<string, QtyRow>();
  for (const row of rows) {
    const name = String(row.name || "").trim();
    const qty = Math.max(0, Number(row.qty) || 0);
    if (!name || qty <= 0) continue;
    const key = norm(name);
    const existing = out.get(key);
    if (existing) existing.qty += qty;
    else out.set(key, { name, qty });
  }
  return [...out.values()];
}

function copyLimitFor(name: string, format: string): number {
  const rules = getFormatRules(format);
  if (isBasicLandName(name)) return Number.MAX_SAFE_INTEGER;
  if (rules.maxCopies === 1 && isSingletonExceptionCardName(name)) return Number.MAX_SAFE_INTEGER;
  return rules.maxCopies;
}

function clampCopyLimits(rows: QtyRow[], format: string): { rows: QtyRow[]; adjusted: number } {
  let adjusted = 0;
  const next = rows.map((row) => {
    const limit = copyLimitFor(row.name, format);
    if (row.qty <= limit) return row;
    adjusted += 1;
    return { ...row, qty: limit };
  });
  return { rows: normalizeRows(next), adjusted };
}

function clampCommanderRow(rows: QtyRow[], commanderName: string | null): { rows: QtyRow[]; adjusted: boolean } {
  if (!commanderName?.trim()) return { rows, adjusted: false };
  const commanderKey = norm(commanderName);
  let adjusted = false;
  const next: QtyRow[] = [];
  let commanderSeen = false;
  for (const row of rows) {
    if (norm(row.name) !== commanderKey) {
      next.push(row);
      continue;
    }
    if (!commanderSeen) {
      next.push({ name: commanderName, qty: 1 });
      if (row.qty !== 1) adjusted = true;
      commanderSeen = true;
    } else {
      adjusted = true;
    }
  }
  return { rows: normalizeRows(next), adjusted };
}

async function filterCommanderColorIdentity(args: {
  rows: QtyRow[];
  allowedColors: string[];
  getCardDetails: (names: string[]) => Promise<Map<string, CardDetailsRow>>;
}): Promise<{ rows: QtyRow[]; removed: number }> {
  if (!args.allowedColors.length) return { rows: args.rows, removed: 0 };
  const details = await args.getCardDetails(args.rows.map((row) => row.name));
  const filtered = args.rows.filter((row) => {
    const entry = details.get(norm(row.name));
    if (!entry) return true;
    return isWithinColorIdentity(entry as SfCard, args.allowedColors);
  });
  return { rows: filtered, removed: args.rows.length - filtered.length };
}

async function legalRowsOnly(args: {
  rows: QtyRow[];
  analyzeFormat: string;
  getCardDetails: (names: string[]) => Promise<Map<string, CardDetailsRow>>;
  filterRowsForFormat: FinalizeTransformRowsArgs["filterRowsForFormat"];
}) {
  const filterRowsForFormat = args.filterRowsForFormat ?? filterDecklistQtyRowsForFormat;
  return filterRowsForFormat(args.rows, args.analyzeFormat, {
    logPrefix: "/api/deck/transform-finalize",
    getDetailsForNamesCachedOverride: args.getCardDetails,
  });
}

async function sourceRefillCandidates(args: {
  sourceRows: QtyRow[];
  currentRows: QtyRow[];
  analyzeFormat: string;
  isCommander: boolean;
  allowedColors: string[];
  avoidRefillCards?: string[];
  getCardDetails: (names: string[]) => Promise<Map<string, CardDetailsRow>>;
  filterRowsForFormat: FinalizeTransformRowsArgs["filterRowsForFormat"];
}): Promise<QtyRow[]> {
  const currentQty = new Map(normalizeRows(args.currentRows).map((row) => [norm(row.name), row.qty]));
  const avoidRefill = new Set((args.avoidRefillCards ?? []).map((name) => norm(name)).filter(Boolean));
  const missingFromSource = normalizeRows(args.sourceRows)
    .filter((row) => !avoidRefill.has(norm(row.name)))
    .map((row) => {
      const missingQty = Math.max(0, row.qty - (currentQty.get(norm(row.name)) ?? 0));
      return missingQty > 0 ? { name: row.name, qty: missingQty } : null;
    })
    .filter((row): row is QtyRow => row != null);
  if (!missingFromSource.length) return [];

  const legal = await legalRowsOnly({
    rows: missingFromSource,
    analyzeFormat: args.analyzeFormat,
    getCardDetails: args.getCardDetails,
    filterRowsForFormat: args.filterRowsForFormat,
  });
  let candidates = legal.lines;
  if (args.isCommander) {
    candidates = (await filterCommanderColorIdentity({
      rows: candidates,
      allowedColors: args.allowedColors,
      getCardDetails: args.getCardDetails,
    })).rows;
  }
  return clampCopyLimits(candidates, args.analyzeFormat).rows;
}

export async function finalizeTransformRows(args: FinalizeTransformRowsArgs): Promise<{ rows: QtyRow[]; warnings: string[] }> {
  const warnings = [...(args.warnings ?? [])];
  const getCardDetails = args.getCardDetails ?? getDetailsForNamesCached;
  const filterRowsForFormat = args.filterRowsForFormat ?? filterDecklistQtyRowsForFormat;
  let rows = normalizeRows(args.rows);

  if (args.isCommander) {
    const commanderClamped = clampCommanderRow(rows, args.commanderName);
    rows = commanderClamped.rows;
    if (commanderClamped.adjusted) {
      warnings.push("Commander row normalized to a single commander copy.");
    }

    const colorFiltered = await filterCommanderColorIdentity({
      rows,
      allowedColors: args.allowedColors,
      getCardDetails,
    });
    rows = colorFiltered.rows;
    if (colorFiltered.removed > 0) {
      warnings.push(`Final color identity check removed ${colorFiltered.removed} card line(s).`);
    }
  }

  const legal = await legalRowsOnly({
    rows,
    analyzeFormat: args.analyzeFormat,
    getCardDetails,
    filterRowsForFormat,
  });
  rows = legal.lines;
  if (legal.removed.length > 0) {
    warnings.push(`Final legality check removed ${legal.removed.length} card line(s) not legal in ${args.analyzeFormat}.`);
  }

  const clamped = clampCopyLimits(rows, args.analyzeFormat);
  rows = clamped.rows;
  if (clamped.adjusted > 0) {
    warnings.push(`Final copy-count check adjusted ${clamped.adjusted} card line(s).`);
  }

  if (totalDeckQty(rows) < args.targetCount) {
    const candidates = await sourceRefillCandidates({
      sourceRows: args.sourceRows,
      currentRows: rows,
      analyzeFormat: args.analyzeFormat,
      isCommander: args.isCommander,
      allowedColors: args.allowedColors,
      avoidRefillCards: args.avoidRefillCards,
      getCardDetails,
      filterRowsForFormat,
    });
    if (candidates.length) {
      const byName = new Map(rows.map((row) => [norm(row.name), { ...row }]));
      for (const candidate of candidates) {
        if (totalDeckQty([...byName.values()]) >= args.targetCount) break;
        const key = norm(candidate.name);
        const existing = byName.get(key);
        const limit = copyLimitFor(candidate.name, args.analyzeFormat);
        const currentQty = existing?.qty ?? 0;
        const addQty = Math.min(candidate.qty, Math.max(0, limit - currentQty), args.targetCount - totalDeckQty([...byName.values()]));
        if (addQty <= 0) continue;
        if (existing) existing.qty += addQty;
        else byName.set(key, { name: candidate.name, qty: addQty });
      }
      const refilled = normalizeRows([...byName.values()]);
      if (totalDeckQty(refilled) > totalDeckQty(rows)) {
        rows = refilled;
        warnings.push("Final validation restored legal source cards to refill the deck.");
      }
    }
  }

  if (totalDeckQty(rows) > args.targetCount) {
    warnings.push(`List has ${totalDeckQty(rows)} cards after validation; trimmed to ${args.targetCount} for ${args.analyzeFormat}.`);
    rows = trimDeckToMaxQty(rows, args.targetCount);
  }
  if (totalDeckQty(rows) < args.targetCount) {
    warnings.push(`List has ${totalDeckQty(rows)} cards after validation; target is ${args.targetCount} for ${args.analyzeFormat}.`);
  }

  return { rows, warnings: [...new Set(warnings)] };
}
