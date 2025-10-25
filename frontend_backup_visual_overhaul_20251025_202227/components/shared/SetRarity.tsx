"use client";
import React from "react";

export function RarityPill({ rarity }: { rarity: 'common'|'uncommon'|'rare'|'mythic'|string }){
  const map: Record<string, string> = { common: '#9CA3AF', uncommon: '#60A5FA', rare: '#FBBF24', mythic: '#F97316' };
  const bg = map[rarity] || '#9CA3AF';
  const label = rarity?.[0]?.toUpperCase() || '?';
  return <span className="inline-flex items-center justify-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: bg, color: '#111' }}>{label}</span>;
}

export function SetIcon({ code }: { code: string }){
  // Generic token: rounded square with code
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-neutral-600 text-[10px] uppercase" title={code}>
      {code?.slice(0,3)}
    </span>
  );
}
