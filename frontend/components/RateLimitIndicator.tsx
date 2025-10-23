'use client';

import React, { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface RateLimitStatus {
  limit: number;
  remaining: number;
  reset: number;
  percentUsed: number;
}

export default function RateLimitIndicator({ isPro }: { isPro?: boolean }) {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [hasWarned, setHasWarned] = useState(false);

  useEffect(() => {
    // Only show for Pro users
    if (!isPro) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/rate-limit/status');
        const data = await res.json();
        if (data.ok) {
          setStatus(data.status);
          
          // Show warning toast at 90% usage
          if (data.status.percentUsed >= 90 && !hasWarned) {
            setHasWarned(true);
            const { toast } = await import('@/lib/toast-client');
            toast(`⚠️ You're at ${data.status.percentUsed}% of your hourly rate limit`, 'warning');
            capture('rate_limit_warning_shown', { percent_used: data.status.percentUsed });
          }
        }
      } catch (error) {
        console.error('Failed to fetch rate limit status:', error);
      }
    };

    fetchStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    
    return () => clearInterval(interval);
  }, [isPro, hasWarned]);

  // Reset warning when usage drops below 90%
  useEffect(() => {
    if (status && status.percentUsed < 90 && hasWarned) {
      setHasWarned(false);
    }
  }, [status, hasWarned]);

  if (!isPro || !status) return null;

  const getStatusColor = () => {
    if (status.percentUsed >= 90) return 'text-red-400';
    if (status.percentUsed >= 75) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getBarColor = () => {
    if (status.percentUsed >= 90) return 'bg-red-500';
    if (status.percentUsed >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const resetTime = new Date(status.reset * 1000);
  const now = new Date();
  const minutesUntilReset = Math.ceil((resetTime.getTime() - now.getTime()) / 60000);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setShowDetails(!showDetails);
          capture('rate_limit_indicator_clicked', { percent_used: status.percentUsed });
        }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors border ${
          status.percentUsed >= 90 ? 'border-red-500/30' : 
          status.percentUsed >= 75 ? 'border-amber-500/30' : 
          'border-emerald-500/30'
        }`}
        title="API Rate Limit Status"
      >
        <svg className={`w-4 h-4 ${getStatusColor()}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {status.remaining}/{status.limit}
        </span>
      </button>

      {showDetails && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl p-4 z-50">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-white">Rate Limit Status</h3>
              <p className="text-xs text-gray-400 mt-0.5">Pro: {status.limit} requests/hour</p>
            </div>
            <button
              onClick={() => setShowDetails(false)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Usage bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-300">Usage</span>
              <span className={`font-semibold ${getStatusColor()}`}>
                {status.percentUsed}%
              </span>
            </div>
            <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${getBarColor()} transition-all duration-300`}
                style={{ width: `${status.percentUsed}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Remaining:</span>
              <span className={`font-semibold ${getStatusColor()}`}>
                {status.remaining} requests
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Resets in:</span>
              <span className="text-white font-medium">
                {minutesUntilReset} min{minutesUntilReset !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Warning message */}
          {status.percentUsed >= 75 && (
            <div className={`mt-3 p-2 rounded-lg ${
              status.percentUsed >= 90 ? 'bg-red-600/10 border border-red-600/30' : 'bg-amber-600/10 border border-amber-600/30'
            }`}>
              <p className={`text-xs ${status.percentUsed >= 90 ? 'text-red-400' : 'text-amber-400'}`}>
                {status.percentUsed >= 90 
                  ? '⚠️ You\'re close to your limit. Requests will be throttled if exceeded.'
                  : '⏰ You\'re using your rate limit quickly.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}






















