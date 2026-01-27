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
    // Enhanced graph rendering with date labels
    const width = isFullScreen ? 800 : 200;
    const height = isFullScreen ? 400 : 80;
    const padding = isFullScreen ? 40 : 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // Add padding to y-axis range to prevent compression of small variations
    // Use 10% padding on top and bottom, but ensure we don't go below 0
    const rawRange = maxValue - minValue;
    const paddingAmount = rawRange * 0.1; // 10% padding
    const adjustedMin = Math.max(0, minValue - paddingAmount);
    const adjustedMax = maxValue + paddingAmount;
    const range = adjustedMax - adjustedMin || 1;
    
    const pathData = points.map((p, i) => {
      const x = padding + (i / (points.length - 1 || 1)) * chartWidth;
      const y = padding + chartHeight - ((p.total - adjustedMin) / range) * chartHeight;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
    <div className={isFullScreen ? "w-full h-full" : "relative"}>
      <div className={`${isFullScreen ? 'h-[400px]' : 'h-32'} rounded border border-neutral-800 bg-neutral-950/50 relative overflow-hidden`}>
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
                      fill="rgba(255,255,255,0.4)"
                      fontSize="10"
                    >
                      {formatCurrency(value)}
                    </text>
                  </g>
                );
              })}
            </>
          )}
          {/* Area under curve - use adjustedMin for baseline */}
          <path
            d={`${pathData} L ${width - padding} ${padding + chartHeight - ((0 - adjustedMin) / range) * chartHeight} L ${padding} ${padding + chartHeight - ((0 - adjustedMin) / range) * chartHeight} Z`}
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
          {/* Data points */}
          {points.map((p, i) => {
            const x = padding + (i / (points.length - 1 || 1)) * chartWidth;
            const y = padding + chartHeight - ((p.total - adjustedMin) / range) * chartHeight;
            const is30d = point30d && Math.abs(new Date(p.date).getTime() - new Date(point30d.date).getTime()) < 2 * 24 * 60 * 60 * 1000; // within 2 days
            const is60d = point60d && Math.abs(new Date(p.date).getTime() - new Date(point60d.date).getTime()) < 2 * 24 * 60 * 60 * 1000; // within 2 days
            return (
              <g key={i}>
                <circle
                  cx={x}
                  cy={y}
                  r={isFullScreen ? (is30d || is60d ? 6 : 4) : (is30d || is60d ? 3 : 2)}
                  fill={is30d ? "rgb(34, 197, 94)" : is60d ? "rgb(59, 130, 246)" : "rgb(251, 191, 36)"}
                  stroke={is30d ? "rgb(34, 197, 94)" : is60d ? "rgb(59, 130, 246)" : "rgb(251, 191, 36)"}
                  strokeWidth={isFullScreen ? (is30d || is60d ? 3 : 2) : (is30d || is60d ? 2 : 1)}
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
              Expand
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
