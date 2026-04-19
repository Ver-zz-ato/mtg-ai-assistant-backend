/**
 * Rank commander candidates that already passed recent-set release-date eligibility.
 * Blends EDHREC popularity (Scryfall), global rank momentum vs yesterday, and ManaTap deck adoption (7d).
 */

import { normName, type NormalizedGlobalMetaRow } from "./scryfallGlobalMeta";

export type NewSetBreakoutRow = {
  name: string;
  count: number;
  blendedScore?: number;
  badge?: string;
  movementLabel?: string;
  dataScope?: "blend";
};

const RISING_MIN_RANK_DELTA = 8;

/** Normalize week commander keys for lookup (counts may use different casing). */
export function weekCountForCommander(weekCounts: Record<string, number>, displayName: string): number {
  const raw = weekCounts[displayName];
  if (typeof raw === "number") return raw;
  const nn = normName(displayName);
  for (const [k, v] of Object.entries(weekCounts)) {
    if (normName(k) === nn) return v;
  }
  return 0;
}

function releaseMonthLabel(releasedAt: string | null | undefined): string {
  if (!releasedAt) return "";
  const d = new Date(releasedAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

/**
 * @param eligible — commanders from Scryfall with date-eligible printings only
 * @param weekCounts — ManaTap public Commander decks in last 7d keyed by commander display name
 */
export function rankNewSetBreakoutCommanders(params: {
  eligible: NormalizedGlobalMetaRow[];
  weekCounts: Record<string, number>;
  yesterdayRanks: Map<string, number>;
  globalPopular: NormalizedGlobalMetaRow[];
  maxRows?: number;
}): NewSetBreakoutRow[] {
  const { eligible, weekCounts, yesterdayRanks, globalPopular, maxRows = 8 } = params;
  if (eligible.length === 0) return [];

  const maxWeek = Math.max(1, ...Object.values(weekCounts));
  const rankToday = new Map(globalPopular.map((g) => [g.nameNorm, g.rank]));
  const maxScore = Math.max(1e-9, ...eligible.map((g) => g.score));

  const scored: { g: NormalizedGlobalMetaRow; blended: number; rankDelta: number }[] = [];
  for (const g of eligible) {
    const nn = g.nameNorm;
    const deckN = weekCountForCommander(weekCounts, g.name);
    const deckPart = deckN / maxWeek;
    const popPart = g.score / maxScore;
    const prev = yesterdayRanks.get(nn);
    const cur = rankToday.get(nn);
    let trendPart = 0;
    let rankDelta = 0;
    if (prev != null && cur != null && prev > 0) {
      rankDelta = prev - cur;
      trendPart = Math.min(1, Math.max(0, rankDelta / 120));
    }
    const blended = 0.38 * popPart + 0.27 * trendPart + 0.35 * deckPart;
    scored.push({ g, blended, rankDelta });
  }

  scored.sort((a, b) => b.blended - a.blended);

  return scored.slice(0, maxRows).map((s, i) => {
    const meta = s.g.meta as { set?: string | null; released_at?: string | null } | undefined;
    const rawSet = (meta?.set ?? "").trim();
    const setCode = rawSet ? rawSet.toUpperCase().slice(0, 8) : "";
    const rising = s.rankDelta >= RISING_MIN_RANK_DELTA;
    const badge = setCode
      ? rising
        ? `${setCode} · RISING`
        : `${setCode} · NEW`
      : rising
        ? "RISING"
        : "NEW";
    const movementLabel = releaseMonthLabel(meta?.released_at ?? undefined) || undefined;
    return {
      name: s.g.name,
      count: i + 1,
      blendedScore: Number(s.blended.toFixed(4)),
      badge,
      movementLabel,
      dataScope: "blend",
    };
  });
}
