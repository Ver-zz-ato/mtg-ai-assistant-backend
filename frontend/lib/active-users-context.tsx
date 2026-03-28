'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

export interface ActivityItem {
  type: string;
  message: string;
  timestamp: string;
}

export interface ActiveUsersData {
  activeUsers: number;
  recentActivity: ActivityItem[];
  loading: boolean;
}

const defaultData: ActiveUsersData = {
  activeUsers: 0,
  recentActivity: [],
  loading: true,
};

const ActiveUsersContext = createContext<ActiveUsersData>(defaultData);

/** Poll interval when the tab is visible (was 60s — reduced Vercel invocations). */
const POLL_MS = 120_000;
/** When returning to a visible tab, refetch only if data is older than this (avoids redundant GETs). */
const STALE_ON_VISIBLE_MS = 90_000;

export function ActiveUsersProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ActiveUsersData>(defaultData);
  const lastFetchAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    async function fetchActivity() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch('/api/stats/activity', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (json.ok === false) return;
        lastFetchAtRef.current = Date.now();
        setData({
          activeUsers: json.activeUsers ?? 0,
          recentActivity: Array.isArray(json.recentActivity) ? json.recentActivity : [],
          loading: false,
        });
      } catch {
        setData((prev) => ({ ...prev, loading: false }));
      } finally {
        inFlightRef.current = false;
      }
    }

    function tick() {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchActivity();
    }

    void fetchActivity();

    const interval = setInterval(tick, POLL_MS);

    const onVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      const stale =
        lastFetchAtRef.current === 0 || Date.now() - lastFetchAtRef.current > STALE_ON_VISIBLE_MS;
      if (stale) void fetchActivity();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, []);

  return (
    <ActiveUsersContext.Provider value={data}>
      {children}
    </ActiveUsersContext.Provider>
  );
}

export function useActiveUsers(): ActiveUsersData {
  return useContext(ActiveUsersContext);
}
