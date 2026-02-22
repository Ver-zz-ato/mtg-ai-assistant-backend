// hooks/usePriceTrends.ts
// Hook to batch-fetch price trend data for multiple cards

import { useState, useEffect, useCallback } from 'react';
import { TrendDirection } from '@/lib/price/trend';

export interface CardTrend {
  direction: TrendDirection;
  pctChange: number;
}

export type TrendMap = Record<string, CardTrend>;

interface UsePriceTrendsOptions {
  currency?: 'USD' | 'EUR' | 'GBP';
  windowDays?: number;
  enabled?: boolean;
}

/**
 * Hook to fetch price trends for a batch of card names.
 * Returns a map of card name -> trend info.
 */
export function usePriceTrends(
  cardNames: string[],
  options: UsePriceTrendsOptions = {}
): { trends: TrendMap; loading: boolean; error: string | null; refetch: () => void } {
  const { currency = 'USD', windowDays = 7, enabled = true } = options;
  
  const [trends, setTrends] = useState<TrendMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrends = useCallback(async () => {
    if (!enabled || cardNames.length === 0) {
      setTrends({});
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const uniqueNames = Array.from(new Set(cardNames)).slice(0, 100);
      
      const res = await fetch('/api/price/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          names: uniqueNames,
          currency,
          windowDays,
        }),
      });

      const data = await res.json();

      if (data?.ok && data.trends) {
        setTrends(data.trends);
      } else {
        setError(data?.error || 'Failed to fetch trends');
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [cardNames.join('|'), currency, windowDays, enabled]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  return { trends, loading, error, refetch: fetchTrends };
}

/**
 * Get trend glyph and color for a trend direction.
 */
export function getTrendDisplay(direction: TrendDirection): { glyph: string; color: string; label: string } {
  switch (direction) {
    case 'up':
      return { glyph: '↑', color: 'text-emerald-400', label: 'Rising' };
    case 'down':
      return { glyph: '↓', color: 'text-red-400', label: 'Falling' };
    default:
      return { glyph: '→', color: 'text-neutral-500', label: 'Stable' };
  }
}

/**
 * Format percentage change for display.
 */
export function formatTrendPct(pctChange: number): string {
  const pct = Math.abs(pctChange * 100).toFixed(1);
  if (pctChange > 0) return `+${pct}%`;
  if (pctChange < 0) return `-${pct}%`;
  return '~0%';
}
