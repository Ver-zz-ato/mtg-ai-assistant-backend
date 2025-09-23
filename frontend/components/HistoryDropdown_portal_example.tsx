'use client';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import TopLayer from './TopLayer';

type ThreadMeta = { id: string; title: string; created_at: string };

export default function HistoryDropdownPortal({
  threads,
  value,
  onChange,
}: {
  threads: ThreadMeta[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ left: Math.round(r.left), top: Math.round(r.top) });
      setReady(true);
    }
    update();
    const ro = new ResizeObserver(update);
    const obsTarget = anchorRef.current;
    if (obsTarget) ro.observe(obsTarget);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      if (obsTarget) ro.unobserve(obsTarget);
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);

  // Anchor ensures layout places us correctly but it's not interactive
  return (
    <div className="relative" ref={anchorRef}>
      {ready && (
        <TopLayer left={pos.left} top={pos.top}>
          <select
            className="history-click-fix w-[12rem] rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">New thread</option>
            {threads?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title ?? t.id}
              </option>
            ))}
          </select>
        </TopLayer>
      )}
    </div>
  );
}
