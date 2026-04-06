/**
 * Hermetic Scryfall-shaped rows for recommendation legality tests.
 * Keys must match {@link normalizeScryfallCacheName} / route cache PKs.
 */
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

export function key(n: string): string {
  return normalizeScryfallCacheName(n);
}

/** Commander-legal colorless rock */
export const ROW_SOL_RING_LEGAL_CMD = {
  legalities: {
    commander: "legal" as const,
    modern: "legal" as const,
    standard: "not_legal" as const,
  },
  color_identity: [] as string[],
};

/** Banned in Commander on Scryfall */
export const ROW_BLACK_LOTUS_BANNED = {
  legalities: {
    commander: "banned" as const,
    vintage: "restricted" as const,
  },
  color_identity: [] as string[],
};

/** Silver border / not legal Commander */
export const ROW_STICKERS_NOT_LEGAL = {
  legalities: {
    commander: "not_legal" as const,
  },
  color_identity: [] as string[],
};

/** Missing commander key (empty object after filter) */
export const ROW_EMPTY_LEGALITIES = {
  legalities: {} as Record<string, string>,
};

export const ROW_COUNTERSTANDARD_LEGAL = {
  legalities: {
    standard: "legal" as const,
    modern: "banned" as const,
    commander: "legal" as const,
  },
  color_identity: ["U"] as string[],
};

export const ROW_DEMONTUTOR_NOT_STANDARD = {
  legalities: {
    standard: "not_legal" as const,
    commander: "legal" as const,
  },
  color_identity: ["B"] as string[],
};

export const ROW_VINTAGE_RESTRICTED = {
  legalities: {
    vintage: "restricted" as const,
    commander: "not_legal" as const,
  },
  color_identity: [] as string[],
};

export const ROW_VINTAGE_LEGAL = {
  legalities: {
    vintage: "legal" as const,
  },
  color_identity: [] as string[],
};

/** Scryfall says legal in Commander but on RL overlay for tests */
export const ROW_OVERBAN_TEST = {
  legalities: { commander: "legal" as const },
  color_identity: [] as string[],
};

export function mockDetailsMap(
  entries: Record<string, { legalities?: Record<string, string>; color_identity?: string[] }>
): Map<string, { legalities?: Record<string, string>; color_identity?: string[] }> {
  const m = new Map<string, { legalities?: Record<string, string>; color_identity?: string[] }>();
  for (const [name, row] of Object.entries(entries)) {
    m.set(key(name), row);
  }
  return m;
}
