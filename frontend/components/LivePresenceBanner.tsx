'use client';
import React from 'react';

interface ActivityItem {
  type: string;
  message: string;
  timestamp: string;
}

interface ActivityData {
  ok: boolean;
  activeUsers: number;
  recentActivity: ActivityItem[];
  cachedAt?: string;
}

export default function LivePresenceBanner() {
  const [data, setData] = React.useState<ActivityData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);
  const [currentTickerIndex, setCurrentTickerIndex] = React.useState(0);
  const tickerTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Check localStorage for dismissed preference on mount
  React.useEffect(() => {
    try {
      const dismissedPref = localStorage.getItem('livePresenceDismissed');
      if (dismissedPref === 'true') {
        setDismissed(true);
        return;
      }
    } catch {}
    // Auto-show (expanded by default, no auto-collapse)
  }, []);

  // Fetch activity data
  React.useEffect(() => {
    async function fetchActivity() {
      try {
        const response = await fetch('/api/stats/activity', { cache: 'no-store' });
        const json = await response.json().catch(() => ({}));
        if (json.ok !== false) {
          setData(json);
        }
      } catch (error) {
        console.warn('Failed to fetch activity:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchActivity();

    // Poll every 60 seconds for fresh data
    const interval = setInterval(fetchActivity, 60000);
    return () => clearInterval(interval);
  }, []);

  // Rotate ticker messages with random intervals between 2-25 seconds
  React.useEffect(() => {
    if (!data?.recentActivity?.length || !expanded) return;

    const scheduleNext = () => {
      // Random interval between 2000ms (2s) and 25000ms (25s)
      const randomInterval = Math.floor(Math.random() * (25000 - 2000 + 1)) + 2000;
      
      tickerTimeoutRef.current = setTimeout(() => {
        setCurrentTickerIndex((prev) => {
          if (!data.recentActivity?.length) return 0;
          return (prev + 1) % data.recentActivity.length;
        });
        scheduleNext(); // Schedule the next rotation
      }, randomInterval);
    };

    scheduleNext(); // Start the first rotation

    return () => {
      if (tickerTimeoutRef.current) {
        clearTimeout(tickerTimeoutRef.current);
      }
    };
  }, [data?.recentActivity, expanded]);

  const handleDismiss = () => {
    try {
      localStorage.setItem('livePresenceDismissed', 'true');
    } catch {}
    setDismissed(true);
  };

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  if (dismissed) return null;
  if (loading && !data) {
    // Minimal loading state - don't show anything until we have data
    return null;
  }
  if (!data || !data.activeUsers) return null;

  const currentActivity = data.recentActivity?.[currentTickerIndex];
  const hasActivity = currentActivity?.message;

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 mb-3">
      <div className="relative bg-neutral-900/50 border border-neutral-800/50 rounded-lg overflow-hidden transition-all duration-300">
        {expanded ? (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            {/* Live presence indicator */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-neutral-200 font-semibold whitespace-nowrap text-base">
                {data.activeUsers} Planeswalker{data.activeUsers !== 1 ? 's' : ''} brewing right now
              </span>
            </div>

            {/* Ticker */}
            {hasActivity && (
              <div className="flex-1 mx-4 overflow-hidden">
                <div 
                  key={currentTickerIndex}
                  className="text-neutral-300 animate-fade-in whitespace-nowrap font-medium"
                >
                  {currentActivity.message}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleToggleExpand}
                className="text-neutral-500 hover:text-neutral-300 transition-colors px-2 py-1 rounded hover:bg-neutral-800/50"
                aria-label="Collapse activity"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={handleDismiss}
                className="text-neutral-500 hover:text-neutral-300 transition-colors px-2 py-1 rounded hover:bg-neutral-800/50"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleToggleExpand}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-neutral-300 hover:text-neutral-200 hover:bg-neutral-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium">Show activity</span>
            </div>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateX(10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

