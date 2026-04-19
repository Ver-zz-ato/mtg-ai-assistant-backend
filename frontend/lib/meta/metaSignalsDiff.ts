/**
 * Helpers for meta-signals job detail: trending diffs and movement preview.
 */

import type { MetaSignalsMoverEntry } from "./metaSignalsJobStatus";

export type LegacyCmdRowLike = {
  name: string;
  movementLabel?: string;
};

export function namesFromPrevSignal(prev: unknown): string[] {
  if (!Array.isArray(prev)) return [];
  const out: string[] = [];
  for (const r of prev) {
    const o = r as { name?: string };
    if (typeof o?.name === "string") out.push(o.name);
  }
  return out;
}

export function topAdditionsRemovals(
  prevNames: string[],
  nextNames: string[],
  limit = 3
): { additions: string[]; removals: string[] } {
  const prevSet = new Set(prevNames);
  const nextSet = new Set(nextNames);
  const additions = nextNames.filter((n) => !prevSet.has(n));
  const removals = prevNames.filter((n) => !nextSet.has(n));
  return {
    additions: [...new Set(additions)].slice(0, limit),
    removals: [...new Set(removals)].slice(0, limit),
  };
}

export function topMoversFromRows(rows: LegacyCmdRowLike[], limit = 3): MetaSignalsMoverEntry[] {
  const scored: { name: string; label: string; mag: number }[] = [];
  for (const r of rows) {
    const ml = r.movementLabel;
    if (!ml) continue;
    const up = ml.match(/▲(\d+)/);
    const down = ml.match(/▼(\d+)/);
    const mag = up ? parseInt(up[1], 10) : down ? parseInt(down[1], 10) : 0;
    if (mag > 0) scored.push({ name: r.name, label: ml, mag });
  }
  scored.sort((a, b) => b.mag - a.mag);
  return scored.slice(0, limit).map(({ name, label }) => ({ name, label }));
}

export function sectionNamesChanged(
  prevNames: string[],
  nextNames: string[],
  nextCount: number
): boolean {
  if (prevNames.length !== nextCount) return true;
  const prevSet = new Set(prevNames);
  if (nextNames.some((n) => !prevSet.has(n))) return true;
  const nextSet = new Set(nextNames);
  return prevNames.some((n) => !nextSet.has(n));
}
