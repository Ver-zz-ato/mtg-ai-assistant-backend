'use client';

import { useState, useEffect } from 'react';
import { TrendInfo, computeTrend, computeTrendFromDelta, formatTrendLabel } from '@/lib/price/trend';

interface PriceTrendGlyphProps {
  /** Array of prices (oldest to newest) */
  prices?: number[];
  /** Or provide prior + current directly */
  prior?: number;
  current?: number;
  /** Pre-computed trend info */
  trend?: TrendInfo;
  /** Show percentage alongside glyph */
  showPct?: boolean;
  /** Size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Custom className */
  className?: string;
}

export default function PriceTrendGlyph({
  prices,
  prior,
  current,
  trend: precomputedTrend,
  showPct = false,
  size = 'sm',
  showTooltip = true,
  className = '',
}: PriceTrendGlyphProps) {
  // Compute trend from available data
  let trend: TrendInfo;
  
  if (precomputedTrend) {
    trend = precomputedTrend;
  } else if (prices && prices.length >= 2) {
    trend = computeTrend(prices);
  } else if (prior !== undefined && current !== undefined) {
    trend = computeTrendFromDelta(prior, current);
  } else {
    return null;
  }

  const sizeClasses = {
    xs: 'text-[10px]',
    sm: 'text-xs',
    md: 'text-sm',
  };

  const tooltip = showTooltip
    ? `${trend.label}${trend.pctChange !== undefined ? ` (${formatTrendLabel(trend)})` : ''}`
    : undefined;

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium ${trend.color} ${sizeClasses[size]} ${className}`}
      title={tooltip}
    >
      <span className="leading-none">{trend.glyph}</span>
      {showPct && trend.pctChange !== undefined && (
        <span className="leading-none">{formatTrendLabel(trend)}</span>
      )}
    </span>
  );
}

/**
 * Hook to fetch and compute trend for a card name.
 * Returns trend info or null while loading.
 */
export function usePriceTrend(cardName: string, currency: 'USD' | 'EUR' | 'GBP' = 'USD') {
  const [trend, setTrend] = useState<TrendInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cardName) return;
    
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const params = new URLSearchParams({
          'names[]': cardName,
          currency,
        });
        const from = new Date();
        from.setDate(from.getDate() - 7); // Last 7 days
        params.set('from', from.toISOString().slice(0, 10));

        const res = await fetch(`/api/price/series?${params.toString()}`);
        const data = await res.json();

        if (cancelled) return;

        if (data?.ok && Array.isArray(data.series) && data.series.length > 0) {
          const points = data.series[0]?.points;
          if (Array.isArray(points) && points.length >= 2) {
            const prices = points.map((p: { unit: number }) => p.unit);
            setTrend(computeTrend(prices));
          }
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [cardName, currency]);

  return { trend, loading };
}
