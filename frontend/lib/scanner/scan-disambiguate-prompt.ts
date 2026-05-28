import type { ScannerContextPayload } from "@/lib/scanner/recognition";

export type ScanDisambiguatePromptContext = ScannerContextPayload & {
  collectorHint?: string | null;
  sessionCardNames?: string[];
};

export function buildScanDisambiguatePrompt(ctx: ScanDisambiguatePromptContext): string {
  const lines: string[] = [
    `You disambiguate Magic: The Gathering card names from noisy OCR and database fuzzy matches.`,
    `You do NOT see the card image. Pick the best official English card name from the hints.`,
    ``,
    `Return ONLY valid JSON (no markdown):`,
    `{"primary":"Best oracle-style English name or empty string","alternatives":[],"confidence":"high|medium|low","reason":"One short sentence"}`,
    `- primary: must be one of the fuzzy candidates OR a clear correction supported by OCR text; empty if none fit.`,
    `- alternatives: 0-2 other plausible names from the candidate list only.`,
    `- confidence: high only if OCR and top fuzzy agree; medium if plausible; low if guessing.`,
    `- Do not invent sets, collector numbers, or cards not supported by the hints.`,
  ];

  lines.push(``, `Hints:`);
  if (ctx.aiTriggerReason) lines.push(`- Trigger: ${ctx.aiTriggerReason}`);
  if (ctx.normalizedOcrText?.trim()) {
    lines.push(`- OCR text: ${ctx.normalizedOcrText.trim().slice(0, 500)}`);
  }
  if (ctx.ocrCandidates?.length) {
    lines.push(`- OCR title candidates: ${ctx.ocrCandidates.slice(0, 3).join(" | ")}`);
  }
  if (ctx.fuzzyMatches?.length) {
    const fm = ctx.fuzzyMatches
      .slice(0, 5)
      .map((m) => (typeof m.score === "number" ? `${m.name} (${m.score.toFixed(2)})` : m.name))
      .join(" | ");
    lines.push(`- Fuzzy matches (pick from these when possible): ${fm}`);
  }
  if (ctx.collectorHint?.trim()) {
    lines.push(`- Collector lookup hint (SET+number): ${ctx.collectorHint.trim()}`);
  }
  if (ctx.sessionCardNames?.length) {
    lines.push(
      `- Cards already scanned this session (bias only if OCR is ambiguous): ${ctx.sessionCardNames.slice(0, 8).join(" | ")}`
    );
  }

  return lines.join("\n");
}
