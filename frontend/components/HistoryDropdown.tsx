
'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import TopLayer from './TopLayer';
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

  // Positioning for TopLayer
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [ready, setReady] = useState(false);

  // measure position
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setPos({ left: Math.round(r.left), top: Math.round(r.top) });
      setReady(true);
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

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
    <div ref={anchorRef} className="relative history-click-fix-wrapper" style={{ pointerEvents: 'none' }} data-testid={props['data-testid']}>
      {ready && (
        <TopLayer left={pos.left} top={pos.top}>
          <select
            className="history-click-fix w-[12rem] rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
            value={selectValue}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">{loading ? 'Loading…' : 'New thread'}</option>
            {threads?.map((t) => (
              <option key={t.id} value={t.id}>{t.title ?? t.id}</option>
            ))}
          </select>
        </TopLayer>
      )}
      {/* ghost placeholder keeps layout stable */}
      <div className="w-[12rem] h-[32px]" />
    </div>
  );
}
