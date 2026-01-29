'use client';

import { createContext, useContext, useEffect, useState } from 'react';

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

const POLL_MS = 60_000;

export function ActiveUsersProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ActiveUsersData>(defaultData);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch('/api/stats/activity', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (json.ok === false) return;
        setData({
          activeUsers: json.activeUsers ?? 0,
          recentActivity: Array.isArray(json.recentActivity) ? json.recentActivity : [],
          loading: false,
        });
      } catch {
        setData((prev) => ({ ...prev, loading: false }));
      }
    }

    fetchActivity();
    const interval = setInterval(fetchActivity, POLL_MS);
    return () => clearInterval(interval);
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
