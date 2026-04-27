/**
 * Pure helpers for POST /api/deck/finish-suggestions — safe for unit tests without DB/OpenAI.
 */
import type { AnalyzeFormat } from "@/lib/deck/formatRules";
import { normalizeDeckFormat, deckFormatStringToAnalyzeFormat } from "@/lib/deck/formatRules";
import { parseDeckText, parseDeckTextWithZones } from "@/lib/deck/parseDeckText";
import { MAX_DECK_ANALYZE_DECK_TEXT_CHARS } from "@/lib/feature-limits";

export const FINISH_V1_CANONICAL = ["commander", "modern", "pioneer", "standard", "pauper"] as const;

export type FinishTargetStats = {
  deckSize: number;
  currentMainboardCount: number;
  currentSideboardCount: number;
  missingMainboardSlots: number;
};

/** Supported v1 formats only — rejects Legacy/Vintage/etc. */
export function resolveFinishAnalyzeFormat(bodyFormat?: string, deckFormat?: string | null): AnalyzeFormat | null {
  const raw = (typeof bodyFormat === "string" && bodyFormat.trim() ? bodyFormat : deckFormat ?? "").trim();
  if (!raw) return null;
  const canon = normalizeDeckFormat(raw);
  if (!canon || !(FINISH_V1_CANONICAL as readonly string[]).includes(canon)) return null;
  return deckFormatStringToAnalyzeFormat(raw);
}

export function computeFinishTargetStats(analyzeFormat: AnalyzeFormat, deckText: string): FinishTargetStats {
  const text = deckText.trim();
  if (analyzeFormat === "Commander") {
    const entries = parseDeckText(text);
    const currentMainboardCount = entries.reduce((s, e) => s + Math.max(0, Math.floor(Number(e.qty) || 0)), 0);
    const deckSize = 100;
    return {
      deckSize,
      currentMainboardCount,
      currentSideboardCount: 0,
      missingMainboardSlots: Math.max(0, deckSize - currentMainboardCount),
    };
  }

  const zoned = parseDeckTextWithZones(text, { isCommanderFormat: false });
  let main = 0;
  let side = 0;
  for (const row of zoned) {
    const q = Math.max(0, Math.floor(Number(row.qty) || 0));
    if (String(row.zone || "mainboard").toLowerCase() === "sideboard") side += q;
    else main += q;
  }
  const deckSize = 60;
  return {
    deckSize,
    currentMainboardCount: main,
    currentSideboardCount: side,
    missingMainboardSlots: Math.max(0, deckSize - main),
  };
}

export function truncateDeckTextForPrompt(deckText: string, maxChars = MAX_DECK_ANALYZE_DECK_TEXT_CHARS): { text: string; truncated: boolean } {
  const t = deckText.trim();
  if (t.length <= maxChars) return { text: t, truncated: false };
  return { text: `${t.slice(0, maxChars)}\n\n[…truncated for AI context cap]`, truncated: true };
}

export function clampMaxSuggestions(raw?: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : 12;
  return Math.min(20, Math.max(1, n));
}

export type RawAiSuggestion = {
  card?: string;
  qty?: number;
  zone?: string;
  role?: string;
  reason?: string;
  priority?: string;
  confidence?: number;
};

/** Extract JSON object from model output (handles ``` fences). */
export function parseFinishSuggestionsJson(raw: string): { suggestions: RawAiSuggestion[]; warnings: string[] } {
  const warnings: string[] = [];
  let t = raw.trim();
  const fenceOpen = t.indexOf("```");
  if (fenceOpen !== -1) {
    let innerStart = t.indexOf("\n", fenceOpen);
    if (innerStart === -1) innerStart = fenceOpen + 3;
    else innerStart += 1;
    const close = t.lastIndexOf("```");
    if (close > fenceOpen) t = t.slice(innerStart, close).trim();
  }

  const tryParse = (s: string): unknown => JSON.parse(s);

  let parsed: unknown;
  try {
    parsed = tryParse(t);
  } catch {
    const brace = t.indexOf("{");
    const lastBrace = t.lastIndexOf("}");
    if (brace !== -1 && lastBrace > brace) {
      try {
        parsed = tryParse(t.slice(brace, lastBrace + 1));
      } catch {
        warnings.push("Could not parse AI JSON output.");
        return { suggestions: [], warnings };
      }
    } else {
      warnings.push("Could not parse AI JSON output.");
      return { suggestions: [], warnings };
    }
  }

  const obj = parsed as { suggestions?: unknown };
  if (!obj || typeof obj !== "object") {
    warnings.push("AI JSON root was not an object.");
    return { suggestions: [], warnings };
  }
  const arr = Array.isArray(obj.suggestions) ? obj.suggestions : [];
  const suggestions: RawAiSuggestion[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    suggestions.push(row as RawAiSuggestion);
  }
  if (arr.length > 0 && suggestions.length === 0) warnings.push("AI suggestions array contained no usable entries.");
  return { suggestions, warnings };
}
