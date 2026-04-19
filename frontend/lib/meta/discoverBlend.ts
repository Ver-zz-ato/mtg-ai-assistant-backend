/**
 * Blends external (Scryfall/EDHREC-ordered) signals with ManaTap internal deck activity.
 * Weights: ~80% external popularity / global signal, ~20% internal where available.
 */

import { normName, type NormalizedGlobalMetaRow } from "./scryfallGlobalMeta";
import { TRENDING_CARDS_OUTPUT_LIMIT } from "./trendingCardsCompute";

const W_EXT = 0.8;
const W_INT = 0.2;

export type BlendedCommanderRow = {
  name: string;
  count: number;
  blendedScore?: number;
  badge?: "Rising" | "Popular" | "New";
  dataScope?: "blend" | "internal" | "global";
};

export type BlendedCardRow = {
  name: string;
  count: number;
  blendedScore?: number;
  badge?: "Rising" | "Popular" | "Budget" | "New";
  /** Formatted USD/EUR from Scryfall prices on the global print */
  priceLabel?: string;
  dataScope?: "blend" | "internal" | "global";
};

function maxVal(m: Record<string, number>): number {
  let x = 0;
  for (const v of Object.values(m)) if (v > x) x = v;
  return x || 1;
}

function normMap(m: Record<string, number>): Record<string, number> {
  const mx = maxVal(m);
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) o[k] = mx > 0 ? v / mx : 0;
  return o;
}

export function blendMostPlayedCommanders(params: {
  internal7d: Record<string, number>;
  globalPopular: NormalizedGlobalMetaRow[];
}): { rows: BlendedCommanderRow[]; externalOk: boolean } {
  const { internal7d, globalPopular } = params;
  const intByNorm = new Map<string, { display: string; c: number }>();
  for (const [rawName, c] of Object.entries(internal7d)) {
    intByNorm.set(normName(rawName), { display: rawName.trim(), c });
  }
  const intN = normMap(
    Object.fromEntries([...intByNorm.entries()].map(([k, v]) => [k, v.c]))
  );
  const globalByNorm = new Map<string, NormalizedGlobalMetaRow>();
  for (const g of globalPopular) globalByNorm.set(g.nameNorm, g);
  const extOk = globalPopular.length > 0;
  let maxS = 0;
  for (const g of globalPopular) {
    if (g.score > maxS) maxS = g.score;
  }
  if (maxS <= 0) maxS = 1;

  const names = new Set<string>([...intByNorm.keys(), ...globalByNorm.keys()]);

  const scored: { name: string; blended: number; intC: number; extPart: number }[] = [];
  for (const nn of names) {
    const g = globalByNorm.get(nn);
    const intPart = intN[nn] ?? 0;
    const extPart = g ? g.score / maxS : 0;
    const blended = extOk ? W_EXT * extPart + W_INT * intPart : intPart;
    const intC = intByNorm.get(nn)?.c ?? 0;
    const displayName = g?.name ?? intByNorm.get(nn)?.display;
    if (!displayName) continue;
    scored.push({ name: displayName, blended, intC, extPart });
  }

  scored.sort((a, b) => b.blended - a.blended);
  const rows: BlendedCommanderRow[] = scored.slice(0, 24).map((s) => ({
    name: s.name,
    count: Math.max(1, Math.round(s.intC) || 1),
    blendedScore: Number(s.blended.toFixed(4)),
    /** Badges are applied client-side (Discover) to avoid POPULAR spam */
    badge: undefined,
    dataScope: extOk ? "blend" : "internal",
  }));
  return { rows, externalOk: extOk };
}

export function blendTrendingCommanders(params: {
  internal30d: Record<string, number>;
  globalPopular: NormalizedGlobalMetaRow[];
  recentSet: NormalizedGlobalMetaRow[];
  yesterdayRanks: Map<string, number>;
}): { rows: BlendedCommanderRow[]; externalOk: boolean } {
  const { internal30d, globalPopular, recentSet, yesterdayRanks } = params;
  const intByNorm = new Map<string, { display: string; c: number }>();
  for (const [rawName, c] of Object.entries(internal30d)) {
    intByNorm.set(normName(rawName), { display: rawName.trim(), c });
  }
  const intN = normMap(
    Object.fromEntries([...intByNorm.entries()].map(([k, v]) => [k, v.c]))
  );
  const globalByNorm = new Map<string, NormalizedGlobalMetaRow>();
  for (const g of globalPopular) globalByNorm.set(g.nameNorm, g);
  const recentByNorm = new Map<string, NormalizedGlobalMetaRow>();
  for (const g of recentSet) recentByNorm.set(g.nameNorm, g);

  const extOk = globalPopular.length > 0 || recentSet.length > 0;

  const names = new Set<string>([
    ...Object.keys(intN),
    ...globalByNorm.keys(),
    ...recentByNorm.keys(),
  ]);

  const topGlobalScore = globalPopular[0]?.score || 1;
  const topRecentScore = recentSet[0]?.score || 1;

  let maxMom = 1;
  const momentumScores: Record<string, number> = {};
  for (const nn of names) {
    const g = globalByNorm.get(nn);
    const prev = g ? yesterdayRanks.get(nn) : undefined;
    const cur = g?.rank;
    if (prev != null && cur != null && prev > 0) {
      const mom = Math.max(0, prev - cur);
      momentumScores[nn] = mom;
      if (mom > maxMom) maxMom = mom;
    } else {
      momentumScores[nn] = 0;
    }
  }

  const scored: { name: string; nn: string; blended: number; intC: number }[] = [];
  for (const nn of names) {
    const g = globalByNorm.get(nn);
    const rs = recentByNorm.get(nn);
    const displayName = g?.name || rs?.name || intByNorm.get(nn)?.display;
    if (!displayName) continue;
    const intPart = intN[nn] ?? 0;
    let globPart = 0;
    if (g?.score) globPart += 0.55 * (g.score / topGlobalScore);
    if (rs?.score) globPart += 0.25 * (rs.score / topRecentScore);
    const momPart = maxMom > 0 ? (momentumScores[nn] ?? 0) / maxMom : 0;
    const blended = extOk ? 0.22 * intPart + 0.33 * momPart + 0.45 * Math.min(1, globPart) : intPart;
    const intC = intByNorm.get(nn)?.c ?? 0;
    scored.push({ name: displayName, nn, blended, intC });
  }

  scored.sort((a, b) => b.blended - a.blended);
  const rows: BlendedCommanderRow[] = scored.slice(0, 24).map((s) => {
    return {
      name: s.name,
      count: Math.max(1, Math.round(s.intC) || 1),
      blendedScore: Number(s.blended.toFixed(4)),
      /** Rising / labels are applied client-side using movement + blend */
      badge: undefined,
      dataScope: extOk ? "blend" : "internal",
    };
  });
  return { rows, externalOk: extOk };
}

export function blendCardLists(params: {
  internalCounts: Record<string, number>;
  globalRows: NormalizedGlobalMetaRow[];
  weightExternal?: number;
}): { rows: BlendedCardRow[]; externalOk: boolean } {
  const { internalCounts, globalRows } = params;
  const wE = params.weightExternal ?? W_EXT;
  const wI = 1 - wE;
  const intByNorm = new Map<string, { display: string; c: number }>();
  for (const [rawName, c] of Object.entries(internalCounts)) {
    intByNorm.set(normName(rawName), { display: rawName.trim(), c });
  }
  const intN = normMap(
    Object.fromEntries([...intByNorm.entries()].map(([k, v]) => [k, v.c]))
  );
  const globalByNorm = new Map<string, NormalizedGlobalMetaRow>();
  for (const g of globalRows) globalByNorm.set(g.nameNorm, g);
  const extOk = globalRows.length > 0;
  let maxS = 0;
  for (const g of globalRows) if (g.score > maxS) maxS = g.score;
  if (maxS <= 0) maxS = 1;

  const names = new Set<string>([...intByNorm.keys(), ...globalByNorm.keys()]);

  const scored: { name: string; blended: number; intC: number; extPart: number }[] = [];
  for (const nn of names) {
    const g = globalByNorm.get(nn);
    const displayName = g?.name || intByNorm.get(nn)?.display;
    if (!displayName) continue;
    const intPart = intN[nn] ?? 0;
    const extPart = g ? g.score / maxS : 0;
    const blended = extOk ? wE * extPart + wI * intPart : intPart;
    const intC = intByNorm.get(nn)?.c ?? 0;
    scored.push({ name: displayName, blended, intC, extPart });
  }
  scored.sort((a, b) => b.blended - a.blended);
  const rows: BlendedCardRow[] = scored.slice(0, 36).map((s) => {
    const nn = normName(s.name);
    const g = globalByNorm.get(nn);
    const m = g?.meta as { usd?: number; eur?: number } | undefined;
    let priceLabel: string | undefined;
    if (m?.usd != null && m.usd > 0) priceLabel = `$${m.usd.toFixed(2)}`;
    else if (m?.eur != null && m.eur > 0) priceLabel = `€${m.eur.toFixed(2)}`;
    return {
      name: s.name,
      count: Math.max(1, Math.round(s.intC) || 1),
      blendedScore: Number(s.blended.toFixed(4)),
      badge: undefined,
      priceLabel,
      dataScope: extOk ? "blend" : "internal",
    };
  });
  return { rows, externalOk: extOk };
}

export function toLegacyCommanderShape(rows: BlendedCommanderRow[]) {
  return rows.map((r) => ({
    name: r.name,
    count: r.count,
    blendedScore: r.blendedScore,
    badge: r.badge,
    dataScope: r.dataScope,
  }));
}

export function toLegacyCardShape(rows: BlendedCardRow[]) {
  return rows.map((r) => ({
    name: r.name,
    count: r.count,
    blendedScore: r.blendedScore,
    badge: r.badge,
    priceLabel: r.priceLabel,
    dataScope: r.dataScope,
  }));
}

/** Re-ranks internal trend deltas with a light global (EDHREC) prior — keeps spike detection, adds world context. */
export function blendTrendingCardsWithGlobal(
  internalRows: { name: string; count: number }[],
  globalPopular: NormalizedGlobalMetaRow[]
): BlendedCardRow[] {
  if (internalRows.length === 0) return [];
  const gMap = new Map(globalPopular.map((g) => [g.nameNorm, g]));
  const maxI = Math.max(...internalRows.map((r) => r.count), 1);
  const maxG = Math.max(...globalPopular.map((g) => g.score), 1) || 1;
  const extOk = globalPopular.length > 0;
  const scored = internalRows.map((r) => {
    const nn = normName(r.name);
    const g = gMap.get(nn);
    const iPart = r.count / maxI;
    const gPart = g ? g.score / maxG : 0;
    const blended = extOk ? 0.72 * iPart + 0.28 * gPart : iPart;
    return { name: r.name, count: r.count, blended, gPart };
  });
  scored.sort((a, b) => b.blended - a.blended);
  return scored.slice(0, TRENDING_CARDS_OUTPUT_LIMIT).map((s) => ({
    name: s.name,
    count: s.count,
    blendedScore: Number(s.blended.toFixed(4)),
    badge: s.gPart > 0.45 ? "Popular" : undefined,
    dataScope: extOk ? "blend" : "internal",
  }));
}
