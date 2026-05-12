/**
 * Single chat request format resolution (Phase 1 — gating + observability).
 * Prefers explicit client prefs/context, then linked deck format, else unknown.
 * Does not default explicit unknown/limited formats to Commander for gating.
 */

import {
  type AnalyzeFormat,
  type DeckFormatCanonical,
  FORMAT_LABEL,
  isCommanderFormatString,
  isConstructed60Format,
  normalizeDeckFormat,
  toAnalyzeFormat,
} from "@/lib/deck/formatRules";
import {
  getFormatSupportEntry,
  getLimitedSupportNote,
  type FormatSupportEntry,
} from "@/lib/deck/formatSupportMatrix";

export type ChatFormatSource = "request" | "deck" | "unknown";

export type ResolvedChatFormat = {
  rawRequest: string | null;
  rawDeck: string | null;
  /** Canonical when recognized (commander / standard / modern / pioneer / pauper); null if unknown */
  canonical: DeckFormatCanonical | null;
  /** Matrix entry for first-class or limited formats; null when the raw format is unrecognized. */
  supportEntry: FormatSupportEntry | null;
  source: ChatFormatSource;
};

function resolvedFromRaw(
  rawRequest: string | null,
  rawDeck: string | null,
  rawValue: string,
  source: ChatFormatSource
): ResolvedChatFormat | null {
  const canonical = normalizeDeckFormat(rawValue);
  const supportEntry = getFormatSupportEntry(rawValue);
  if (!canonical && !supportEntry) return null;
  return {
    rawRequest,
    rawDeck,
    canonical,
    supportEntry,
    source,
  };
}

function firstString(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function inferChatFormatFromUserText(text?: string | null): DeckFormatCanonical | null {
  const q = String(text || "").toLowerCase();
  const checks: Array<[DeckFormatCanonical, RegExp]> = [
    ["commander", /\b(commander|edh)\b/],
    ["standard", /\bstandard\b/],
    ["modern", /\bmodern\b/],
    ["pioneer", /\bpioneer\b/],
    ["pauper", /\bpauper\b/],
  ];
  for (const [format, rx] of checks) {
    if (rx.test(q)) return format;
  }
  return null;
}

function rawWithTextFallback(raw: string | null, text?: string | null): string | null {
  return raw ?? inferChatFormatFromUserText(text);
}

/**
 * Priority when normalizing **recognized** formats (each step only commits if normalizeDeckFormat succeeds):
 * 1) prefs.format
 * 2) context.format (e.g. future mobile passthrough)
 * 3) linked deck.format
 * 4) unknown (canonical null — unparseable prefs/context alone never blocks deck fallback)
 *
 * @param prefsFormat - website prefs or legacy
 * @param contextFormat - optional mobile `context.format` (future-safe)
 * @param deckFormat - `decks.format` when linked
 */
export function resolveChatFormat(opts: {
  prefsFormat?: unknown;
  contextFormat?: unknown;
  deckFormat?: unknown;
  userText?: unknown;
}): ResolvedChatFormat {
  const prefsRaw = firstString(opts.prefsFormat);
  const contextRaw = rawWithTextFallback(firstString(opts.contextFormat), firstString(opts.userText));
  const rawDeck = firstString(opts.deckFormat);

  if (prefsRaw) {
    const resolved = resolvedFromRaw(prefsRaw, rawDeck, prefsRaw, "request");
    if (resolved) return resolved;
  }

  if (contextRaw) {
    const resolved = resolvedFromRaw(contextRaw, rawDeck, contextRaw, "request");
    if (resolved) return resolved;
  }

  if (rawDeck) {
    return resolvedFromRaw(null, rawDeck, rawDeck, "deck") ?? {
      rawRequest: null,
      rawDeck,
      canonical: null,
      supportEntry: null,
      source: "unknown",
    };
  }

  const junkHint = prefsRaw ?? contextRaw;
  if (junkHint) {
    return {
      rawRequest: junkHint,
      rawDeck: null,
      canonical: null,
      supportEntry: null,
      source: "unknown",
    };
  }

  return { rawRequest: null, rawDeck: null, canonical: null, supportEntry: null, source: "unknown" };
}

/** FORMAT_* prompt layer key: unknown → commander (preserve legacy prompt stack). */
export function formatKeyForPromptLayers(canonical: DeckFormatCanonical | null): string {
  return canonical ?? "commander";
}

export function formatKeyForChatPromptLayers(resolved: ResolvedChatFormat): string {
  if (resolved.canonical) return resolved.canonical;
  if (resolved.rawRequest || resolved.rawDeck) return "generic";
  return "commander";
}

/** True only for explicit Commander/EDH style formats — commander confirmation, grounding, singleton assumptions. Unknown → false (avoid EDH-specific gating). */
export function chatFormatUsesCommanderLayers(canonical: DeckFormatCanonical | null): boolean {
  return canonical != null && isCommanderFormatString(canonical);
}

export function chatResolvedFormatUsesCommanderLayers(resolved: ResolvedChatFormat): boolean {
  if (resolved.canonical) return isCommanderFormatString(resolved.canonical);
  return !resolved.rawRequest && !resolved.rawDeck;
}

export function chatFormatIsConstructed60(canonical: DeckFormatCanonical | null): boolean {
  return canonical != null && isConstructed60Format(canonical);
}

export function chatAnalyzeFormat(resolved: ResolvedChatFormat): AnalyzeFormat | null {
  if (resolved.canonical) return toAnalyzeFormat(resolved.canonical);
  if (!resolved.rawRequest && !resolved.rawDeck) return "Commander";
  return null;
}

export function chatFormatDisplayName(resolved: ResolvedChatFormat): string | null {
  if (resolved.canonical) return FORMAT_LABEL[resolved.canonical];
  return resolved.supportEntry?.label ?? null;
}

export function chatFormatForLegality(resolved: ResolvedChatFormat): string | null {
  if (resolved.canonical) return FORMAT_LABEL[resolved.canonical];
  if (!resolved.rawRequest && !resolved.rawDeck) return "Commander";
  return resolved.supportEntry?.label ?? null;
}

export function chatFormatSupportInstruction(resolved: ResolvedChatFormat): string | null {
  const limitedNote = getLimitedSupportNote(resolved.supportEntry?.key ?? null);
  if (limitedNote) {
    const label = resolved.supportEntry?.label ?? "This format";
    return [
      "CHAT FORMAT SUPPORT NOTE:",
      limitedNote,
      `Do not analyze this deck as Commander unless the user explicitly changes the format to Commander. For ${label}, give general MTG help and legality-aware comments, and say deeper ManaTap deck analysis is limited when the user asks for full analysis, roast, cost-to-finish, or mulligan advice.`,
    ].join("\n");
  }
  if ((resolved.rawRequest || resolved.rawDeck) && !resolved.canonical && !resolved.supportEntry) {
    const raw = resolved.rawRequest ?? resolved.rawDeck;
    return [
      "CHAT FORMAT SUPPORT NOTE:",
      `The provided format "${raw}" is not recognized by ManaTap's format matrix.`,
      "Do not silently treat it as Commander. Ask the user to choose Commander, Modern, Pioneer, Standard, or Pauper before giving format-specific deck analysis.",
    ].join("\n");
  }
  return null;
}

/** Compose export-style deck text from DB rows (mainboard first, optional Sideboard section). */
export function buildDeckTextFromDbRows(
  rows: Array<{ name: string; qty?: number | null; zone?: string | null }>
): string {
  const line = (name: string, qty: number) => `${qty} ${name}`;
  const main = rows.filter((r) => String(r.zone || "mainboard").toLowerCase() !== "sideboard");
  const side = rows.filter((r) => String(r.zone || "mainboard").toLowerCase() === "sideboard");
  const q = (r: { name: string; qty?: number | null }) => Math.max(1, Math.floor(Number(r.qty) || 0));
  const mainBlock = main.map((r) => line(String(r.name || "").trim(), q(r))).join("\n");
  if (!side.length) return mainBlock;
  return `${mainBlock}\n\nSideboard\n${side.map((r) => line(String(r.name || "").trim(), q(r))).join("\n")}`;
}
