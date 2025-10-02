'use client';
import React from 'react';
import { usePro } from '@/components/ProContext';

export default function ProBadge() {
  const { isPro } = usePro();
  if (!isPro) return null;
  return (
    <span className="inline-flex items-center rounded bg-amber-300 text-black text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wide">
      Pro
    </span>
  );
}