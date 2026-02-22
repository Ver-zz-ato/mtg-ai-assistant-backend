// lib/price/trend.ts
// Price trend utilities for computing and displaying ↑/↓/→ indicators

export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendInfo {
  direction: TrendDirection;
  glyph: string;
  color: string;
  label: string;
  pctChange?: number;
}

/**
 * Compute trend direction from an array of price points.
 * Uses linear regression slope over the data points.
 * @param prices Array of prices (oldest to newest)
 * @param threshold Minimum % change to consider "trending" (default 3%)
 */
export function computeTrend(prices: number[], threshold = 0.03): TrendInfo {
  if (!prices || prices.length < 2) {
    return { direction: 'flat', glyph: '→', color: 'text-neutral-500', label: 'Stable' };
  }

  const first = prices[0];
  const last = prices[prices.length - 1];
  
  if (first <= 0) {
    return { direction: 'flat', glyph: '→', color: 'text-neutral-500', label: 'Stable' };
  }

  const pctChange = (last - first) / first;

  if (pctChange > threshold) {
    return { 
      direction: 'up', 
      glyph: '↑', 
      color: 'text-emerald-400', 
      label: 'Rising',
      pctChange 
    };
  }
  
  if (pctChange < -threshold) {
    return { 
      direction: 'down', 
      glyph: '↓', 
      color: 'text-red-400', 
      label: 'Falling',
      pctChange 
    };
  }

  return { 
    direction: 'flat', 
    glyph: '→', 
    color: 'text-neutral-500', 
    label: 'Stable',
    pctChange 
  };
}

/**
 * Compute trend from two price values (prior and current).
 */
export function computeTrendFromDelta(prior: number, current: number, threshold = 0.03): TrendInfo {
  if (!prior || prior <= 0) {
    return { direction: 'flat', glyph: '→', color: 'text-neutral-500', label: 'Stable' };
  }
  return computeTrend([prior, current], threshold);
}

/**
 * Format trend as a compact string for display.
 */
export function formatTrendLabel(trend: TrendInfo): string {
  if (trend.pctChange === undefined) return trend.label;
  const pct = Math.abs(trend.pctChange * 100).toFixed(1);
  if (trend.direction === 'up') return `+${pct}%`;
  if (trend.direction === 'down') return `-${pct}%`;
  return '~0%';
}
