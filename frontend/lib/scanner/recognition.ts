export type ScannerConfidence = "high" | "medium" | "low";
export type ScannerEvidence = "title_line" | "art" | "ocr_hint" | "fuzzy_hint";

export type ScannerContextPayload = {
  normalizedOcrText?: string;
  ocrCandidates?: string[];
  fuzzyMatches?: Array<{ name: string; score?: number }>;
  aiTriggerReason?: string;
};

export function normalizeScannerText(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]/g, "'")
    .trim();
}

export function scannerConfidenceScore(confidence: ScannerConfidence): number {
  if (confidence === "high") return 0.9;
  if (confidence === "medium") return 0.65;
  return 0.35;
}

export function scannerContextAgreesWithName(ctx: ScannerContextPayload | null, name: string): boolean {
  const target = normalizeScannerText(name);
  if (!target) return false;
  if (ctx?.fuzzyMatches?.some((m) => normalizeScannerText(m.name) === target)) return true;
  if (
    ctx?.ocrCandidates?.some((c) => {
      const candidate = normalizeScannerText(c);
      return candidate === target || target.includes(candidate) || candidate.includes(target);
    })
  ) {
    return true;
  }
  const ocr = normalizeScannerText(ctx?.normalizedOcrText || "");
  return Boolean(ocr && (ocr.includes(target) || target.includes(ocr)));
}

export function inferScannerEvidence(params: {
  parsedReason: string;
  ctx: ScannerContextPayload | null;
  validatedName: string;
  validationSource: string;
}): ScannerEvidence {
  const reason = params.parsedReason.toLowerCase();
  if (params.ctx?.fuzzyMatches?.some((m) => normalizeScannerText(m.name) === normalizeScannerText(params.validatedName))) {
    return "fuzzy_hint";
  }
  if (params.ctx?.ocrCandidates?.some((c) => normalizeScannerText(c) === normalizeScannerText(params.validatedName))) {
    return "ocr_hint";
  }
  if (params.validationSource.startsWith("cache") || reason.includes("title")) return "title_line";
  return "art";
}

export function canAutoAddScannerRecognition(params: {
  confidence: ScannerConfidence;
  validationSource: string;
  ctx: ScannerContextPayload | null;
  validatedName: string;
}): boolean {
  if (params.confidence !== "high") return false;
  if (params.validationSource === "cache_exact") return true;
  return scannerContextAgreesWithName(params.ctx, params.validatedName);
}
