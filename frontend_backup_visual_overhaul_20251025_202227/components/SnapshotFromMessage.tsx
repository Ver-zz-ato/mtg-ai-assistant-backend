'use client';
import React from 'react';
import DeckHealthCard from '@/components/DeckHealthCard';

type Bands = { curve: number; ramp: number; draw: number; removal: number; mana: number };

// Renders a snapshot card from legacy message meta
export default function SnapshotFromMessage({
  meta,
}: {
  meta: {
    health: number;
    bands: Partial<Bands> | Record<string, number>;
    whatsGood?: string[];
    quickFixes?: string[];
    curveBuckets?: number[];
    note?: string;
  };
}) {
  const bands: Bands = {
    curve: Number((meta.bands as any)?.curve ?? 0),
    ramp: Number((meta.bands as any)?.ramp ?? 0),
    draw: Number((meta.bands as any)?.draw ?? 0),
    removal: Number((meta.bands as any)?.removal ?? 0),
    mana: Number((meta.bands as any)?.mana ?? 0),
  };

  const whatsGood = meta.whatsGood ?? [];
  const quickFixes = meta.quickFixes ?? [];
  const curveBuckets = meta.curveBuckets ?? [];

  return (
    <div className="mt-3">
      <DeckHealthCard
        result={{
          score: Number(meta.health ?? 0),
          note: meta.note ?? 'quick snapshot',
          bands,
          whatsGood,
          quickFixes,
          curveBuckets,
          illegalByCI: 0,
          illegalExamples: [],
        }}
      />
    </div>
  );
}
