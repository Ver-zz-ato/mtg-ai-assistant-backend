import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { aggregateCards, getCommanderColorIdentity, norm, totalDeckQty } from "@/lib/deck/generation-helpers";
import {
  getCopyCountViolations,
  getFormatRules,
  isBasicLandName,
  isCommanderFormatString,
  isSingletonExceptionCardName,
  tryDeckFormatStringToAnalyzeFormat,
} from "@/lib/deck/formatRules";
import { warnSourceOffColor } from "@/lib/deck/transform-warnings";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { filterDecklistQtyRowsForFormat } from "@/lib/deck/recommendation-legality";

type QtyRow = { name: string; qty: number };
type CardDetailsRow = RecommendationLegalityRow & { color_identity?: string[] | null };
type RecommendationLegalityRow = { legalities?: Record<string, string> | null };

export type TransformLegalityPrecheck = {
  alreadyLegal: boolean;
  needsDeckSizeOnlyReview: boolean;
  needsDeterministicRepair: boolean;
  analyzeFormat: string;
  commanderName: string | null;
  colors: string[];
  warnings: string[];
  validatedRows: QtyRow[];
  removedReasons: Array<{ name: string; reason: string }>;
};

type TransformLegalityPrecheckDeps = {
  getCommanderColors?: (name: string) => Promise<string[]>;
  getCardDetails?: (names: string[]) => Promise<Map<string, CardDetailsRow>>;
  filterRowsForFormat?: (
    rows: QtyRow[],
    userFormat: string,
    opts?: { logPrefix?: string; getDetailsForNamesCachedOverride?: (names: string[]) => Promise<Map<string, CardDetailsRow>> }
  ) => Promise<{ lines: QtyRow[]; removed: Array<{ name: string; reason: string }> }>;
  warnOffColor?: (sourceDeckText: string, commander: string | null | undefined) => Promise<string | null | undefined>;
};

function clampRowsToCopyLimits(rows: QtyRow[], format: string): { rows: QtyRow[]; adjustedLines: number } {
  const rules = getFormatRules(format);
  let adjustedLines = 0;
  const nextRows = rows.map((row) => {
    const name = String(row.name || "").trim();
    if (!name) return row;
    if (isBasicLandName(name)) return row;
    if (rules.maxCopies === 1 && isSingletonExceptionCardName(name)) return row;
    if (row.qty <= rules.maxCopies) return row;
    adjustedLines += 1;
    return { ...row, qty: rules.maxCopies };
  });
  return { rows: nextRows, adjustedLines };
}

export async function precheckFixLegalitySourceDeck(
  input: { sourceDeckText: string; format: string; commander?: string | null },
  deps: TransformLegalityPrecheckDeps = {},
): Promise<TransformLegalityPrecheck | null> {
  const analyzeFormat = tryDeckFormatStringToAnalyzeFormat(input.format);
  if (!analyzeFormat) return null;

  const sourceRows = aggregateCards(parseDeckText(input.sourceDeckText));
  if (sourceRows.length === 0) return null;

  const rules = getFormatRules(analyzeFormat);
  const isCommander = isCommanderFormatString(analyzeFormat);
  const commanderName = isCommander ? input.commander || sourceRows[0]?.name || "Unknown" : null;
  const getCommanderColors = deps.getCommanderColors ?? getCommanderColorIdentity;
  const getCardDetails = deps.getCardDetails ?? getDetailsForNamesCached;
  const filterRowsForFormat = deps.filterRowsForFormat ?? filterDecklistQtyRowsForFormat;
  const warnOffColor = deps.warnOffColor ?? warnSourceOffColor;

  const colors = isCommander && commanderName ? (await getCommanderColors(commanderName)).map((c) => c.toUpperCase()) : [];
  const sourceDetails = await getCardDetails(sourceRows.map((c) => c.name));

  const warnings: string[] = [];
  const removedReasons: Array<{ name: string; reason: string }> = [];
  let validatedRows = sourceRows;
  let droppedCi = 0;
  let legalityRemoved = 0;

  if (isCommander) {
    const warnSrc = await warnOffColor(input.sourceDeckText, commanderName);
    if (warnSrc) warnings.push(warnSrc);

    const beforeCi = validatedRows.length;
    const filtered = validatedRows.filter((c) => {
      const entry = sourceDetails.get(norm(c.name));
      if (!entry) return true;
      return isWithinColorIdentity(entry as SfCard, colors);
    });
    droppedCi = beforeCi - filtered.length;
    if (droppedCi > 0) {
      warnings.push(`Source deck has ${droppedCi} card line(s) outside commander color identity.`);
      const keptKeys = new Set(filtered.map((row) => norm(row.name)));
      for (const row of validatedRows) {
        if (!keptKeys.has(norm(row.name))) {
          removedReasons.push({
            name: row.name,
            reason: commanderName
              ? `Removed [[${row.name}]] because it falls outside [[${commanderName}]]'s color identity.`
              : `Removed [[${row.name}]] because it falls outside the deck's color identity.`,
          });
        }
      }
    }
    validatedRows = filtered;
  }

  const { lines: legalLines, removed } = await filterRowsForFormat(validatedRows, analyzeFormat, {
    logPrefix: "/api/deck/transform-source-check",
    getDetailsForNamesCachedOverride: getCardDetails,
  });
  legalityRemoved = removed.length;
  if (legalityRemoved > 0) {
    warnings.push(`Source deck has ${legalityRemoved} card line(s) not legal in ${analyzeFormat}.`);
    for (const item of removed) {
      let reason = `Removed [[${item.name}]] because it is not legal in ${analyzeFormat}.`;
      if (item.reason === "banned") {
        reason = `Removed [[${item.name}]] because it is banned in ${analyzeFormat}.`;
      } else if (item.reason === "missing_legality" || item.reason === "cache_miss") {
        reason = `Removed [[${item.name}]] because legality could not be verified for ${analyzeFormat}, so the legality pass dropped it instead of guessing.`;
      }
      removedReasons.push({ name: item.name, reason });
    }
  }
  validatedRows = legalLines;

  const copyViolations = getCopyCountViolations(validatedRows, analyzeFormat);
  if (copyViolations.length > 0) {
    warnings.push(`Source deck has ${copyViolations.length} copy-count violation(s) for ${analyzeFormat}.`);
    const clamped = clampRowsToCopyLimits(validatedRows, analyzeFormat);
    if (clamped.adjustedLines > 0) {
      warnings.push(`Extra copies were removed from ${clamped.adjustedLines} card line(s) to match ${analyzeFormat} copy limits.`);
      const clampedMap = new Map(clamped.rows.map((row) => [norm(row.name), row.qty]));
      for (const row of validatedRows) {
        const nextQty = clampedMap.get(norm(row.name)) ?? row.qty;
        if (nextQty < row.qty) {
          removedReasons.push({
            name: row.name,
            reason: `Removed extra copies of [[${row.name}]] to match ${analyzeFormat} copy limits.`,
          });
        }
      }
    }
    validatedRows = clamped.rows;
  }

  const finalQty = totalDeckQty(validatedRows);
  if (finalQty !== rules.mainDeckTarget) {
    warnings.push(`Source deck has ${finalQty} cards after validation; target is ${rules.mainDeckTarget} for ${analyzeFormat}.`);
  }
  const requiresRepair = droppedCi > 0 || legalityRemoved > 0 || copyViolations.length > 0;
  const alreadyLegal =
    !requiresRepair &&
    finalQty === rules.mainDeckTarget;
  const needsDeckSizeOnlyReview = !requiresRepair && finalQty !== rules.mainDeckTarget;

  return {
    alreadyLegal,
    needsDeckSizeOnlyReview,
    needsDeterministicRepair: requiresRepair,
    analyzeFormat,
    commanderName,
    colors,
    warnings,
    validatedRows,
    removedReasons,
  };
}
