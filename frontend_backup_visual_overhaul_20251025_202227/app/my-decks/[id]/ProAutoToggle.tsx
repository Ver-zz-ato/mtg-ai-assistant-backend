"use client";
import { useEffect, useState } from "react";

export default function ProAutoToggle() {
  const [on, setOn] = useState<boolean>(false);
  // Load saved state after mount to avoid hydration mismatches
  useEffect(() => { try { const v = localStorage.getItem('pro_auto_update'); if (v === '1') setOn(true); } catch {} }, []);
  useEffect(()=>{ try { localStorage.setItem('pro_auto_update', on ? '1' : '0'); } catch {} }, [on]);

  useEffect(() => {
    if (!on) return;
    let timer: any = null;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('r', String(Date.now()));
          window.location.replace(url.toString());
        } catch {}
      }, 800);
    };
    window.addEventListener('deck:changed', handler);
    return () => { window.removeEventListener('deck:changed', handler); clearTimeout(timer); };
  }, [on]);

  return (
    <div className="inline-flex items-center gap-2" title="Pro: auto-recompute trends (debounced)">
      <label className="inline-flex items-center gap-1">
        <input type="checkbox" checked={on} onChange={(e)=>setOn(e.target.checked)} />
        <span className="text-xs">Auto update</span>
      </label>
      {on && (<span className="px-1.5 py-0.5 rounded bg-emerald-700/20 border border-emerald-600 text-emerald-300 text-[10px]">Auto update active</span>)}
    </div>
  );
}