import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";
import { aggregateCards, getCommanderColorIdentity, norm, totalDeckQty, trimDeckToMaxQty } from "@/lib/deck/generation-helpers";
import { getCopyCountViolations, getFormatRules, isCommanderFormatString, tryDeckFormatStringToAnalyzeFormat } from "@/lib/deck/formatRules";
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
  analyzeFormat: string;
  commanderName: string | null;
  colors: string[];
  warnings: string[];
  validatedRows: QtyRow[];
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
  let validatedRows = sourceRows;
  let droppedCi = 0;
  let trimmedForTarget = false;
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
    }
    const filteredQty = totalDeckQty(filtered);
    if (filteredQty > rules.mainDeckTarget) {
      trimmedForTarget = true;
      warnings.push(`Source deck has ${filteredQty} cards after color identity filtering; target is ${rules.mainDeckTarget}.`);
      validatedRows = trimDeckToMaxQty(filtered, rules.mainDeckTarget);
    } else {
      validatedRows = filtered;
    }
  }

  const { lines: legalLines, removed } = await filterRowsForFormat(validatedRows, analyzeFormat, {
    logPrefix: "/api/deck/transform-source-check",
    getDetailsForNamesCachedOverride: getCardDetails,
  });
  legalityRemoved = removed.length;
  if (legalityRemoved > 0) {
    warnings.push(`Source deck has ${legalityRemoved} card line(s) not legal in ${analyzeFormat}.`);
  }
  validatedRows = legalLines;

  const copyViolations = getCopyCountViolations(validatedRows, analyzeFormat);
  if (copyViolations.length > 0) {
    warnings.push(`Source deck has ${copyViolations.length} copy-count violation(s) for ${analyzeFormat}.`);
  }

  const finalQty = totalDeckQty(validatedRows);
  if (finalQty !== rules.mainDeckTarget) {
    warnings.push(`Source deck has ${finalQty} cards after validation; target is ${rules.mainDeckTarget} for ${analyzeFormat}.`);
  }
  const requiresRepair = droppedCi > 0 || trimmedForTarget || legalityRemoved > 0 || copyViolations.length > 0;
  const alreadyLegal =
    !requiresRepair &&
    finalQty === rules.mainDeckTarget;
  const needsDeckSizeOnlyReview = !requiresRepair && finalQty !== rules.mainDeckTarget;

  return {
    alreadyLegal,
    needsDeckSizeOnlyReview,
    analyzeFormat,
    commanderName,
    colors,
    warnings,
    validatedRows,
  };
}
