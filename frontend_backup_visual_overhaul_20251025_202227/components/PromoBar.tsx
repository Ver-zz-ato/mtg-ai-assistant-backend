'use client';
import React from 'react';

export default function PromoBar() {
  const [text, setText] = React.useState<string | null>(null);
  const [href, setHref] = React.useState<string | null>(null);
  React.useEffect(() => {
    (async ()=>{
      try { const r = await fetch('/api/config?key=promo', { cache:'no-store' }); const j = await r.json(); const p = j?.config?.promo; if (p?.text) { setText(String(p.text)); setHref(p?.url||null); } } catch {}
    })();
  }, []);
  if (!text) return null;
  return (
    <div className="w-full bg-blue-600 text-white text-center text-sm py-1">
      {href ? (<a href={href} target="_blank" rel="noreferrer" className="underline">{text}</a>) : text}
    </div>
  );
}