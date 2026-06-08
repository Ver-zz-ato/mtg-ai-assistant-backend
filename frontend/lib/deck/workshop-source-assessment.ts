import { aggregateCards, totalDeckQty } from "@/lib/deck/generation-helpers";
import {
  getFormatRules,
  isCommanderFormatString,
  tryDeckFormatStringToAnalyzeFormat,
} from "@/lib/deck/formatRules";
import { parseDeckText, parseDeckTextWithZones } from "@/lib/deck/parseDeckText";
import { warnSourceOffColor } from "@/lib/deck/transform-warnings";
import {
  precheckFixLegalitySourceDeck,
  type TransformLegalityPrecheck,
} from "@/lib/deck/transform-legality-check";
import { constructedGeneralLandCountLooksSeverelyBroken } from "@/lib/deck/transform-enforcement";

export type WorkshopExpectedLegality = "noop" | "size_only_review" | "repair";

export type WorkshopSourceSeverity = "ok" | "review" | "blocked";

export type WorkshopSourceIssueSummary = {
  offColorLineCount: number;
  illegalLineCount: number;
  copyViolationCount: number;
  sourceCount: number;
  targetCount: number;
  sizeDelta: number;
  landCountSeverelyBroken: boolean;
};

export type WorkshopSourceAssessment = {
  expectedLegality: WorkshopExpectedLegality;
  severity: WorkshopSourceSeverity;
  issueSummary: WorkshopSourceIssueSummary;
  precheck: TransformLegalityPrecheck | null;
  messages: string[];
  suggestFixLegalityFirst: boolean;
};

type QtyRow = { name: string; qty: number };

function parseMainboardRows(deckText: string, isCommander: boolean): QtyRow[] {
  if (isCommander) {
    return aggregateCards(parseDeckText(deckText));
  }
  return aggregateCards(
    parseDeckTextWithZones(deckText, { isCommanderFormat: false })
      .filter((row) => row.zone !== "sideboard")
      .map((row) => ({ name: row.name, qty: row.qty })),
  );
}

function countOffColorLinesFromWarning(warning: string | undefined): number {
  if (!warning) return 0;
  const match = warning.match(/lists (\d+) line\(s\) that appear outside/i);
  if (match) return Number(match[1]) || 0;
  const match2 = warning.match(/has (\d+) card line\(s\) outside commander color identity/i);
  return match2 ? Number(match2[1]) || 0 : 0;
}

function deriveExpectedLegality(precheck: TransformLegalityPrecheck | null): WorkshopExpectedLegality {
  if (!precheck) return "noop";
  if (precheck.alreadyLegal) return "noop";
  if (precheck.needsDeckSizeOnlyReview) return "size_only_review";
  if (precheck.needsDeterministicRepair) return "repair";
  return "noop";
}

function deriveSeverity(summary: WorkshopSourceIssueSummary, precheck: TransformLegalityPrecheck | null): WorkshopSourceSeverity {
  const repairCount = (precheck?.removedReasons.length ?? 0) + summary.copyViolationCount;
  const offColorRatio = summary.sourceCount > 0 ? summary.offColorLineCount / summary.sourceCount : 0;

  if (
    Math.abs(summary.sizeDelta) > 15
    || summary.offColorLineCount > 10
    || offColorRatio > 0.15
    || summary.illegalLineCount > 8
    || repairCount > 20
  ) {
    return "blocked";
  }

  if (
    summary.offColorLineCount > 0
    || summary.illegalLineCount > 0
    || summary.copyViolationCount > 0
    || Math.abs(summary.sizeDelta) > 5
    || summary.landCountSeverelyBroken
  ) {
    return "review";
  }

  return "ok";
}

export async function assessWorkshopSourceDeck(input: {
  sourceDeckText: string;
  format: string;
  commander?: string | null;
}): Promise<WorkshopSourceAssessment> {
  const analyzeFormat = tryDeckFormatStringToAnalyzeFormat(input.format);
  const rules = analyzeFormat ? getFormatRules(analyzeFormat) : null;
  const isCommander = analyzeFormat ? isCommanderFormatString(analyzeFormat) : false;
  const sourceRows = analyzeFormat ? parseMainboardRows(input.sourceDeckText, isCommander) : [];
  const sourceCount = totalDeckQty(sourceRows);
  const targetCount = rules?.mainDeckTarget ?? (isCommander ? 100 : 60);

  const precheck = analyzeFormat
    ? await precheckFixLegalitySourceDeck(input).catch(() => null)
    : null;

  const offColorWarning = isCommander && input.commander?.trim()
    ? await warnSourceOffColor(input.sourceDeckText, input.commander.trim()).catch(() => undefined)
    : undefined;

  const offColorFromPrecheck = precheck?.warnings.find((w) => /outside commander color identity/i.test(w));
  const offColorLineCount = Math.max(
    countOffColorLinesFromWarning(offColorWarning),
    countOffColorLinesFromWarning(offColorFromPrecheck),
  );

  const illegalLineCount = precheck?.warnings.reduce((sum, warning) => {
    const banned = warning.match(/has (\d+) card line\(s\) not legal/i);
    return sum + (banned ? Number(banned[1]) || 0 : 0);
  }, 0) ?? 0;

  const copyViolationCount = precheck?.warnings.reduce((sum, warning) => {
    const copies = warning.match(/has (\d+) copy-count violation/i);
    return sum + (copies ? Number(copies[1]) || 0 : 0);
  }, 0) ?? 0;

  const validatedCount = precheck ? totalDeckQty(precheck.validatedRows) : sourceCount;
  const sizeDelta = validatedCount - targetCount;

  const issueSummary: WorkshopSourceIssueSummary = {
    offColorLineCount,
    illegalLineCount,
    copyViolationCount,
    sourceCount,
    targetCount,
    sizeDelta,
    landCountSeverelyBroken: !isCommander && constructedGeneralLandCountLooksSeverelyBroken(sourceRows),
  };

  const expectedLegality = deriveExpectedLegality(precheck);
  const severity = deriveSeverity(issueSummary, precheck);
  const messages = [...(precheck?.warnings ?? [])];
  if (offColorWarning && !messages.includes(offColorWarning)) messages.unshift(offColorWarning);

  const suggestFixLegalityFirst =
    severity !== "ok"
    && (expectedLegality === "repair" || issueSummary.landCountSeverelyBroken || Math.abs(issueSummary.sizeDelta) > 5);

  return {
    expectedLegality,
    severity,
    issueSummary,
    precheck,
    messages,
    suggestFixLegalityFirst,
  };
}

export function sourceDeckNeedsLegalityFirst(args: {
  sourceRows: QtyRow[];
  targetCount: number;
  isCommander: boolean;
  precheck: TransformLegalityPrecheck | null;
}): boolean {
  const sourceCount = totalDeckQty(args.sourceRows);
  if (Math.abs(sourceCount - args.targetCount) > 5) return true;

  if (!args.isCommander && constructedGeneralLandCountLooksSeverelyBroken(args.sourceRows)) {
    return true;
  }

  if (!args.precheck) return false;

  if (args.precheck.needsDeterministicRepair) {
    const uniqueLines = args.sourceRows.length;
    const repairLines = args.precheck.removedReasons.length;
    if (uniqueLines > 0 && repairLines / uniqueLines > 0.1) return true;
    if (repairLines > 5) return true;
  }

  const offColorCount = args.precheck.warnings.reduce((sum, warning) => {
    const match = warning.match(/has (\d+) card line\(s\) outside commander color identity/i);
    return sum + (match ? Number(match[1]) || 0 : 0);
  }, 0);

  if (args.isCommander && offColorCount > 5) return true;

  return false;
}
