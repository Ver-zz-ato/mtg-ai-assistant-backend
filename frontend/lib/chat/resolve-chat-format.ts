/**
 * Single chat request format resolution (Phase 1 — gating + observability).
 * Prefers explicit client prefs/context, then linked deck format, else unknown.
 * Does not default unknown to Commander for gating; use formatKeyForPromptLayers for compose FORMAT_* only.
 */

import {
  type DeckFormatCanonical,
  isCommanderFormatString,
  isConstructed60Format,
  normalizeDeckFormat,
} from "@/lib/deck/formatRules";

export type ChatFormatSource = "request" | "deck" | "unknown";

export type ResolvedChatFormat = {
  rawRequest: string | null;
  rawDeck: string | null;
  /** Canonical when recognized (commander / standard / modern / pioneer / pauper); null if unknown */
  canonical: DeckFormatCanonical | null;
  source: ChatFormatSource;
};

function firstString(...vals: Array<unknown>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
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
}): ResolvedChatFormat {
  const prefsRaw = firstString(opts.prefsFormat);
  const contextRaw = firstString(opts.contextFormat);
  const rawDeck = firstString(opts.deckFormat);

  if (prefsRaw) {
    const canonical = normalizeDeckFormat(prefsRaw);
    if (canonical) {
      return {
        rawRequest: prefsRaw,
        rawDeck,
        canonical,
        source: "request",
      };
    }
  }

  if (contextRaw) {
    const canonical = normalizeDeckFormat(contextRaw);
    if (canonical) {
      return {
        rawRequest: contextRaw,
        rawDeck,
        canonical,
        source: "request",
      };
    }
  }

  if (rawDeck) {
    const canonical = normalizeDeckFormat(rawDeck);
    return {
      rawRequest: null,
      rawDeck,
      canonical,
      source: canonical ? "deck" : "unknown",
    };
  }

  const junkHint = prefsRaw ?? contextRaw;
  if (junkHint) {
    return {
      rawRequest: junkHint,
      rawDeck: null,
      canonical: null,
      source: "unknown",
    };
  }

  return { rawRequest: null, rawDeck: null, canonical: null, source: "unknown" };
}

/** FORMAT_* prompt layer key: unknown → commander (preserve legacy prompt stack). */
export function formatKeyForPromptLayers(canonical: DeckFormatCanonical | null): string {
  return canonical ?? "commander";
}

/** True only for explicit Commander/EDH style formats — commander confirmation, grounding, singleton assumptions. Unknown → false (avoid EDH-specific gating). */
export function chatFormatUsesCommanderLayers(canonical: DeckFormatCanonical | null): boolean {
  return canonical != null && isCommanderFormatString(canonical);
}

export function chatFormatIsConstructed60(canonical: DeckFormatCanonical | null): boolean {
  return canonical != null && isConstructed60Format(canonical);
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
