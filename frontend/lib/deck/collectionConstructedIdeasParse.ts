/**
 * Lenient parsing for OpenAI JSON outputs for collection-constructed deck ideas.
 * Strips markdown fences, accepts { ideas } or alternate keys / raw arrays, normalizes loose idea objects.
 */

import { z } from "zod";

const looseIdeaInner = z
  .object({
    title: z.unknown().optional(),
    archetype: z.unknown().optional(),
    colors: z.unknown().optional(),
    ownedCoreCards: z.unknown().optional(),
    missingKeyCards: z.unknown().optional(),
    reason: z.unknown().optional(),
    warnings: z.unknown().optional(),
  })
  .passthrough();

export function stripMarkdownJsonFences(raw: string): string {
  let s = raw.trim();
  if (!s.startsWith("```")) return s;
  s = s.replace(/^```(?:json)?\s*/i, "");
  const fenceEnd = s.lastIndexOf("```");
  if (fenceEnd >= 0) s = s.slice(0, fenceEnd);
  return s.trim();
}

/** Try to salvage a JSON object substring from prose-wrapped output. */
export function sliceFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function coerceStringArray(x: unknown): string[] {
  if (Array.isArray(x)) {
    return x.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  if (typeof x === "string") {
    return x
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export type NormalizedLooseIdea = {
  title: string;
  archetype?: string;
  colors: string[];
  ownedCoreCards: string[];
  missingKeyCards: string[];
  reason: string;
  warnings: string[];
};

function normalizeOneIdea(raw: unknown): NormalizedLooseIdea | null {
  const p = looseIdeaInner.safeParse(raw);
  if (!p.success) return null;
  const o = p.data;
  const title = String(o.title ?? "")
    .trim()
    .slice(0, 220);
  if (title.length < 2) return null;

  const warningsRaw = o.warnings;
  const warnings = Array.isArray(warningsRaw)
    ? warningsRaw.map((w) => String(w).trim()).filter(Boolean)
    : [];

  return {
    title,
    archetype: o.archetype != null ? String(o.archetype).trim().slice(0, 120) : undefined,
    colors: coerceStringArray(o.colors),
    ownedCoreCards: coerceStringArray(o.ownedCoreCards),
    missingKeyCards: coerceStringArray(o.missingKeyCards),
    reason: o.reason != null ? String(o.reason).trim().slice(0, 3000) : "",
    warnings,
  };
}

function ideasArrayFromRoot(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const j = json as Record<string, unknown>;
    const keys = ["ideas", "deckIdeas", "suggestions", "results", "data"] as const;
    for (const k of keys) {
      const v = j[k];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

export type ParseIdeasResult =
  | { ok: true; ideas: NormalizedLooseIdea[] }
  | { ok: false; reason: "empty" | "invalid_json" | "no_ideas_array" | "no_valid_ideas" };

function tryParseContent(messageContent: string): ParseIdeasResult {
  const stripped = stripMarkdownJsonFences(messageContent);
  let source = stripped;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    const slice = sliceFirstBalancedJsonObject(stripped);
    if (!slice) return { ok: false, reason: "invalid_json" };
    try {
      parsed = JSON.parse(slice);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }

  const arr = ideasArrayFromRoot(parsed);
  if (!arr) return { ok: false, reason: "no_ideas_array" };

  const ideas: NormalizedLooseIdea[] = [];
  for (const item of arr) {
    const n = normalizeOneIdea(item);
    if (n) ideas.push(n);
  }
  if (ideas.length === 0) return { ok: false, reason: "no_valid_ideas" };
  return { ok: true, ideas };
}

/**
 * Parse model output into at least one normalized idea (soft validation).
 * Accepts extra/missing fields; filters ideas without a usable title.
 */
export function parseCollectionConstructedIdeasFromMessage(messageContent: string): ParseIdeasResult {
  if (!messageContent?.trim()) return { ok: false, reason: "empty" };
  return tryParseContent(messageContent);
}
