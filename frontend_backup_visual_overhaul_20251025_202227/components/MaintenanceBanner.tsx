'use client';
import React from 'react';

export default function MaintenanceBanner() {
  const [msg, setMsg] = React.useState<string| null>(null);
  React.useEffect(() => {
    let quit=false;
    (async ()=>{
      try { const r = await fetch('/api/config?key=maintenance', { cache:'no-store' }); const j = await r.json(); const m = j?.config?.maintenance; if (m?.enabled) setMsg(String(m?.message||'Maintenance in progress…')); else setMsg(null); } catch {}
    })();
    return ()=>{ quit=true; };
  }, []);
  if (!msg) return null;
  return (
    <div className="w-full bg-amber-600 text-black text-center text-sm py-1">{msg}</div>
  );
}