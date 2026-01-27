"use client";

import React, { useEffect, useState } from "react";
import Sparkline from "./Sparkline";

interface PricePoint {
  date: string;
  total: number;
}

export default function CollectionPriceHistory({ 
  collectionId, 
  currency 
}: { 
  collectionId: string; 
  currency: 'USD' | 'EUR' | 'GBP';
}) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFullScreen, setShowFullScreen] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; svgX: number; svgY: number } | null>(null);

  useEffect(() => {
    if (!collectionId) return;
    
    setLoading(true);
    fetch(`/api/collections/${encodeURIComponent(collectionId)}/price-history?currency=${currency}&days=60`)
      .then(r => {
        if (!r.ok) {
          console.warn('[CollectionPriceHistory] API error:', r.status, r.statusText);
          return { ok: false, error: `HTTP ${r.status}` };
        }
        return r.json();
      })
      .then(j => {
        if (j?.ok && Array.isArray(j.points)) {
          setPoints(j.points);
        } else {
          console.warn('[CollectionPriceHistory] Invalid response:', j);
          setPoints([]);
        }
      })
      .catch((err) => {
        console.error('[CollectionPriceHistory] Fetch error:', err);
        setPoints([]);
      })
      .finally(() => setLoading(false));
  }, [collectionId, currency]);

  if (loading) {
    return (
      <div className="h-32 rounded border border-neutral-800 bg-neutral-950/50 flex items-center justify-center">
        <div className="text-xs text-neutral-500">Loading price history...</div>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-400">
          No price history available yet. Historical data will appear here as snapshots are collected.
        </p>
        <div className="h-32 rounded border border-neutral-800 bg-neutral-950/50 flex items-center justify-center">
          <div className="text-xs text-neutral-500 italic">Chart will appear here</div>
        </div>
      </div>
    );
  }

  // If only 1 data point, show it but indicate we need more for a graph
  if (points.length === 1) {
    const singleValue = points[0]?.total || 0;
    const formatCurrency = (value: number) => {
      try {
        return new Intl.NumberFormat(undefined, { 
          style: 'currency', 
          currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      } catch {
        return `${currency} ${value.toFixed(0)}`;
      }
    };
    
    return (
      <div className="space-y-2">
        <div className="h-32 rounded border border-neutral-800 bg-neutral-950/50 flex items-center justify-center">
          <div className="text-center">
            <div className="font-semibold text-amber-400 text-lg">{formatCurrency(singleValue)}</div>
            <div className="text-xs text-neutral-500 mt-1">Current value</div>
            <div className="text-[10px] text-neutral-600 mt-2">Need more snapshots for history graph</div>
          </div>
        </div>
        <div className="text-xs text-neutral-500 text-center">
          {points.length} data point{points.length !== 1 ? 's' : ''} • {new Date(points[0].date).toLocaleDateString()}
        </div>
      </div>
    );
  }

  // Find 30d and 60d ago points
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  
  // Find closest points to 30d and 60d ago
  const findClosestPoint = (targetDate: Date): PricePoint | null => {
    let closest: PricePoint | null = null;
    let minDiff = Infinity;
    points.forEach(p => {
      const pointDate = new Date(p.date);
      const diff = Math.abs(pointDate.getTime() - targetDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closest = p;
      }
    });
    return closest;
  };
  
  const point30d: PricePoint | null = findClosestPoint(thirtyDaysAgo);
  const point60d: PricePoint | null = findClosestPoint(sixtyDaysAgo);
  
  const minValue = Math.min(...points.map(p => p.total));
  const maxValue = Math.max(...points.map(p => p.total));
  const latestValue = points[points.length - 1]?.total || 0;
  const previousValue = points.length > 1 ? points[points.length - 2]?.total : latestValue;
  const change = latestValue - previousValue;
  const changePercent = previousValue > 0 ? ((change / previousValue) * 100) : 0;
  
  // Calculate changes from 30d and 60d ago
  const change30d = point30d ? latestValue - point30d.total : null;
  const changePercent30d = point30d && point30d.total > 0 ? ((change30d! / point30d.total) * 100) : null;
  const change60d = point60d ? latestValue - point60d.total : null;
  const changePercent60d = point60d && point60d.total > 0 ? ((change60d! / point60d.total) * 100) : null;

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat(undefined, { 
        style: 'currency', 
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    } catch {
      return `${currency} ${value.toFixed(0)}`;
    }
  };

  // Format date for display
  const formatDate = (dateStr: string, fullScreen: boolean = false) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const ChartContent = ({ isFullScreen = false }: { isFullScreen?: boolean }) => {
    // Auto-expand: use larger size by default for better visibility
    const width = isFullScreen ? 900 : 300;
    const height = isFullScreen ? 500 : 120; // Increased from 80 to 120 for better visibility
    const padding = isFullScreen ? 50 : 15;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // Smart y-axis scaling: handle outliers and focus on data range
    // Detect outliers using IQR (Interquartile Range) method
    const sortedValues = [...points.map(p => p.total)].sort((a, b) => a - b);
    const q1Index = Math.floor(sortedValues.length * 0.25);
    const q3Index = Math.floor(sortedValues.length * 0.75);
    const q1 = sortedValues[q1Index] || minValue;
    const q3 = sortedValues[q3Index] || maxValue;
    const iqr = q3 - q1;
    const outlierThreshold = q3 + (iqr * 1.5); // Standard outlier detection
    
    // Use percentile-based range to exclude outliers
    // Use 5th to 95th percentile for better scaling, but include max if it's not too extreme
    const p5Index = Math.floor(sortedValues.length * 0.05);
    const p95Index = Math.floor(sortedValues.length * 0.95);
    const p5 = sortedValues[p5Index] || minValue;
    const p95 = sortedValues[p95Index] || maxValue;
    
    // Determine if maxValue is an outlier - be more aggressive
    // Check if max is more than 3x the median or 2x the 95th percentile
    const median = sortedValues[Math.floor(sortedValues.length * 0.5)] || q3;
    const isMaxOutlier = maxValue > outlierThreshold || maxValue > p95 * 2 || maxValue > median * 3;
    const isMinOutlier = minValue < (q1 - iqr * 1.5) && minValue < p5 * 0.5;
    
    // Use percentile-based range, completely exclude outliers from scaling
    // For outliers, use p95 as the effective max (with small padding), not the actual max
    const effectiveMin = isMinOutlier ? p5 : minValue;
    const effectiveMax = isMaxOutlier ? p95 : maxValue; // Use p95 directly if outlier, don't include the spike
    
    const rawRange = effectiveMax - effectiveMin;
    
    // Calculate padding based on the data characteristics
    const relativeVariation = effectiveMax > 0 ? rawRange / effectiveMax : 0;
    let paddingAmount: number;
    
    if (relativeVariation < 0.2) {
      // Small variations (<20%): use 30% of effective max value as padding
      paddingAmount = effectiveMax * 0.30;
    } else if (relativeVariation < 0.5) {
      // Medium variations: use 20% of range
      paddingAmount = rawRange * 0.20;
    } else {
      // Large variations: use 15% of range
      paddingAmount = rawRange * 0.15;
    }
    
    // Don't force minimum to 0 - focus on actual data range
    const adjustedMin = effectiveMin < effectiveMax * 0.05
      ? Math.max(0, effectiveMin - paddingAmount)
      : effectiveMin - paddingAmount;
    const adjustedMax = effectiveMax + paddingAmount;
    const range = adjustedMax - adjustedMin || 1;
    
    // Find which data points are outliers for debugging
    const outlierPoints = points.filter(p => p.total > p95 * 2 || p.total > median * 3);
    
    // Debug logging for scaling calculations - expanded
    console.log('[PriceHistory] Scaling debug:', {
      dataPoints: points.length,
      minValue: minValue.toFixed(2),
      maxValue: maxValue.toFixed(2),
      median: median.toFixed(2),
      q1: q1.toFixed(2),
      q3: q3.toFixed(2),
      iqr: iqr.toFixed(2),
      p5: p5.toFixed(2),
      p95: p95.toFixed(2),
      outlierThreshold: outlierThreshold.toFixed(2),
      isMaxOutlier,
      isMinOutlier,
      outlierCount: outlierPoints.length,
      outlierValues: outlierPoints.map(p => ({ date: p.date, total: p.total.toFixed(2) })),
      effectiveMin: effectiveMin.toFixed(2),
      effectiveMax: effectiveMax.toFixed(2),
      rawRange: rawRange.toFixed(2),
      relativeVariation: (relativeVariation * 100).toFixed(1) + '%',
      paddingAmount: paddingAmount.toFixed(2),
      adjustedMin: adjustedMin.toFixed(2),
      adjustedMax: adjustedMax.toFixed(2),
      finalRange: range.toFixed(2),
      samplePoints: points.slice(0, 5).map(p => ({ date: p.date, total: p.total.toFixed(2) })),
      latestValue: latestValue.toFixed(2)
    });
    
    const pathData = points.map((p, i) => {
      const x = padding + (i / (points.length - 1 || 1)) * chartWidth;
      // Clamp Y to chart bounds - outliers will be drawn at top edge
      const rawY = padding + chartHeight - ((p.total - adjustedMin) / range) * chartHeight;
      const y = Math.max(padding, Math.min(padding + chartHeight, rawY));
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
    <div className={isFullScreen ? "w-full h-full" : "relative"}>
      <div className={`${isFullScreen ? 'h-[500px]' : 'h-[120px]'} rounded border border-neutral-800 bg-neutral-950/50 relative overflow-hidden`}>
        <svg 
          width={isFullScreen ? "100%" : width} 
          height={isFullScreen ? "100%" : height} 
          className="absolute inset-0"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`priceGradient${isFullScreen ? 'Full' : ''}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(251, 191, 36, 0.3)" />
              <stop offset="100%" stopColor="rgba(251, 191, 36, 0.05)" />
            </linearGradient>
          </defs>
          {/* Grid lines for full screen with value labels */}
          {isFullScreen && points.length > 1 && (
            <>
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = padding + chartHeight - (ratio * chartHeight);
                const value = adjustedMax - (ratio * range);
                return (
                  <g key={ratio}>
                    <line
                      x1={padding}
                      y1={y}
                      x2={width - padding}
                      y2={y}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="1"
                    />
                    <text
                      x={padding - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill="rgba(255,255,255,0.5)"
                      fontSize="11"
                      fontWeight="500"
                    >
                      {formatCurrency(value)}
                    </text>
                  </g>
                );
              })}
            </>
          )}
          {/* Area under curve - use adjustedMin for baseline (not 0) */}
          <path
            d={`${pathData} L ${width - padding} ${padding + chartHeight} L ${padding} ${padding + chartHeight} Z`}
            fill={`url(#priceGradient${isFullScreen ? 'Full' : ''})`}
          />
          {/* Line */}
          <path
            d={pathData}
            fill="none"
            stroke="rgb(251, 191, 36)"
            strokeWidth={isFullScreen ? "3" : "2"}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Data points with hover tooltips */}
          {points.map((p, i) => {
            const x = padding + (i / (points.length - 1 || 1)) * chartWidth;
            // Clamp Y position to chart bounds - outliers will be drawn at the top edge
            const rawY = padding + chartHeight - ((p.total - adjustedMin) / range) * chartHeight;
            const y = Math.max(padding, Math.min(padding + chartHeight, rawY));
            const isOutlier = p.total > effectiveMax;
            const is30d = point30d && Math.abs(new Date(p.date).getTime() - new Date(point30d.date).getTime()) < 2 * 24 * 60 * 60 * 1000; // within 2 days
            const is60d = point60d && Math.abs(new Date(p.date).getTime() - new Date(point60d.date).getTime()) < 2 * 24 * 60 * 60 * 1000; // within 2 days
            const isHovered = hoveredPoint?.index === i;
            return (
              <g key={i}>
                {/* Invisible larger hit area for easier hovering */}
                <circle
                  cx={x}
                  cy={y}
                  r={isFullScreen ? 8 : 6}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => {
                    setHoveredPoint({ index: i, svgX: x, svgY: y });
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
                {/* Outlier indicator - show a warning icon or different color */}
                {isOutlier && isFullScreen && (
                  <text
                    x={x}
                    y={padding - 5}
                    textAnchor="middle"
                    fill="rgb(239, 68, 68)"
                    fontSize="10"
                    fontWeight="bold"
                  >
                    ⚠
                  </text>
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? (isFullScreen ? (is30d || is60d ? 8 : 6) : (is30d || is60d ? 5 : 4)) : (isFullScreen ? (is30d || is60d ? 6 : 4) : (is30d || is60d ? 3 : 2))}
                  fill={isOutlier ? "rgb(239, 68, 68)" : (is30d ? "rgb(34, 197, 94)" : is60d ? "rgb(59, 130, 246)" : "rgb(251, 191, 36)")}
                  stroke={isOutlier ? "rgb(239, 68, 68)" : (is30d ? "rgb(34, 197, 94)" : is60d ? "rgb(59, 130, 246)" : "rgb(251, 191, 36)")}
                  strokeWidth={isFullScreen ? (is30d || is60d ? 3 : 2) : (is30d || is60d ? 2 : 1)}
                  style={{ transition: 'r 0.2s', pointerEvents: 'none' }}
                />
                {(is30d || is60d) && isFullScreen && (
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    fill={is30d ? "rgb(34, 197, 94)" : "rgb(59, 130, 246)"}
                    fontSize="11"
                    fontWeight="bold"
                  >
                    {is30d ? "30d" : "60d"}
                  </text>
                )}
              </g>
            );
          })}
          {/* Tooltip for hovered point */}
          {hoveredPoint !== null && points[hoveredPoint.index] && (
            <g>
              <rect
                x={hoveredPoint.svgX - 80}
                y={hoveredPoint.svgY - 50}
                width={160}
                height={40}
                fill="rgba(0, 0, 0, 0.9)"
                stroke="rgb(251, 191, 36)"
                strokeWidth="1"
                rx="4"
              />
              <text
                x={hoveredPoint.svgX}
                y={hoveredPoint.svgY - 30}
                textAnchor="middle"
                fill="rgb(251, 191, 36)"
                fontSize="12"
                fontWeight="bold"
              >
                {formatCurrency(points[hoveredPoint.index].total)}
              </text>
              <text
                x={hoveredPoint.svgX}
                y={hoveredPoint.svgY - 15}
                textAnchor="middle"
                fill="rgba(255, 255, 255, 0.7)"
                fontSize="10"
              >
                {formatDate(points[hoveredPoint.index].date, isFullScreen)}
              </text>
            </g>
          )}
          {/* Date labels for full screen */}
          {isFullScreen && points.length > 1 && (
            <>
              {points.map((p, i) => {
                if (i % Math.max(1, Math.floor(points.length / 8)) !== 0 && i !== points.length - 1) return null;
                const x = padding + (i / (points.length - 1 || 1)) * chartWidth;
                return (
                  <text
                    key={i}
                    x={x}
                    y={height - 5}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.6)"
                    fontSize="10"
                  >
                    {formatDate(p.date, isFullScreen)}
                  </text>
                );
              })}
            </>
          )}
        </svg>
        {!isFullScreen && (
          <div className="absolute top-2 right-2 text-xs text-neutral-400">
            <button
              onClick={() => setShowFullScreen(true)}
              className="px-2 py-1 rounded bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 text-xs"
            >
              Full Screen
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <div>
            <div className="font-semibold text-amber-400">{formatCurrency(latestValue)}</div>
            {change !== 0 && (
              <div className={`text-[10px] ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {change >= 0 ? '+' : ''}{formatCurrency(change)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%)
              </div>
            )}
            {isFullScreen && points.length > 1 && (
              <div className="text-[10px] text-neutral-500 mt-1">
                {formatDate(points[0].date, true)} → {formatDate(points[points.length - 1].date, true)}
              </div>
            )}
          </div>
          <div className="text-[10px] text-neutral-500">
            {points.length} data point{points.length !== 1 ? 's' : ''}
          </div>
        </div>
        {/* 30d and 60d ago summary */}
        {(point30d || point60d) && (
          <div className="flex items-center gap-4 text-[10px] pt-1 border-t border-neutral-800">
            {point30d && (
              <div>
                <span className="text-green-400 font-semibold">30d ago:</span> {formatCurrency(point30d.total)}
                {change30d !== null && (
                  <span className={`ml-1 ${change30d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ({change30d >= 0 ? '+' : ''}{formatCurrency(change30d)}, {changePercent30d !== null ? `${changePercent30d >= 0 ? '+' : ''}${changePercent30d.toFixed(1)}%` : ''})
                  </span>
                )}
              </div>
            )}
            {point60d && (
              <div>
                <span className="text-blue-400 font-semibold">60d ago:</span> {formatCurrency(point60d.total)}
                {change60d !== null && (
                  <span className={`ml-1 ${change60d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ({change60d >= 0 ? '+' : ''}{formatCurrency(change60d)}, {changePercent60d !== null ? `${change60d >= 0 ? '+' : ''}${changePercent60d.toFixed(1)}%` : ''})
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    );
  };

  return (
    <>
      <ChartContent />
      {showFullScreen && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setShowFullScreen(false)}
        >
          <div 
            className="bg-neutral-900 rounded-xl border border-neutral-700 p-6 max-w-4xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                Collection Price History (Last 60 Days)
              </h3>
              <button
                onClick={() => setShowFullScreen(false)}
                className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-sm"
              >
                Close
              </button>
            </div>
            <ChartContent isFullScreen />
          </div>
        </div>
      )}
    </>
  );
}
