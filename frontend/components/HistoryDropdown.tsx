
'use client';
import React, { useEffect, useState } from 'react';
import { listThreads } from '@/lib/threads';
import type { ThreadSummary as ThreadMeta } from '@/types/chat';

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
  'data-testid'?: string;
};

export default function HistoryDropdown(props: Props) {
  const { value, onChange } = props;

  // Local threads state; component is responsible for fetching
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fetch threads on mount and whenever parent forces a re-key (Chat passes key={histKey})
  useEffect(() => {
    let aborted = false;
    const ac = new AbortController();
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await listThreads(ac.signal);
        const items = (res?.threads ?? []) as ThreadMeta[];
        if (!aborted) setThreads(Array.isArray(items) ? items : []);
      } catch (e: any) {
        if (!aborted) setError(e?.message || 'Failed to load threads');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => { aborted = true; try { ac.abort(); } catch {} };
  }, []); // relies on parent re-mounting with key to refresh

  const selectValue = value ?? '';

  return (
    <div className="relative" data-testid={props['data-testid']}>
      <select
        className="w-[12rem] rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
        value={selectValue}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ position: 'relative', zIndex: 1000 }}
      >
        <option value="">{loading ? 'Loading…' : 'New thread'}</option>
        {threads?.map((t) => (
          <option key={t.id} value={t.id}>{t.title ?? t.id}</option>
        ))}
      </select>
    </div>
  );
}
