'use client';

import React from 'react';
import type { LeaderRow, MoverRow } from '@/lib/meta/discoverMetaRollups';
import type { MetaSignalsJobDetail } from '@/lib/meta/metaSignalsJobStatus';

export type DiscoverRollupsPayload = {
  ok?: boolean;
  generatedAt?: string;
  windows?: { d7: { start: string; end: string }; d30: { start: string; end: string } };
  source?: unknown;
  rowCounts?: Record<string, number>;
  commanders?: {
    leaders7d: LeaderRow[];
    leaders30d: LeaderRow[];
    movers7d: { risers: MoverRow[]; fallers: MoverRow[] };
  };
  cards?: {
    leaders7d: LeaderRow[];
    leaders30d: LeaderRow[];
  };
  newSetBreakouts?: {
    available: boolean;
    message?: string;
    debug?: MetaSignalsJobDetail['newSetBreakoutsDebug'];
  };
  caveats?: string[];
  commandCenterPreview?: {
    topCommanders7d: LeaderRow[];
    topMovers7dRisers: MoverRow[];
  };
};

function LeaderTable({
  title,
  rows,
  windowLabel,
}: {
  title: string;
  rows: LeaderRow[];
  windowLabel: string;
}) {
  if (!rows?.length) {
    return (
      <div className="text-xs text-neutral-500 py-2">
        No {title.toLowerCase()} data for {windowLabel} (need daily snapshots in range).
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <div className="text-[11px] text-neutral-400 mb-1">{title}</div>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-left text-neutral-500 border-b border-neutral-700">
            <th className="py-1 pr-2 font-medium">Name</th>
            <th className="py-1 pr-2 font-medium">Avg rank</th>
            <th className="py-1 pr-2 font-medium">Latest</th>
            <th className="py-1 pr-2 font-medium">Days</th>
            <th className="py-1 pr-2 font-medium">First→last</th>
            <th className="py-1 pr-2 font-medium">Δ</th>
            <th className="py-1 pr-2 font-medium">Top24%</th>
            <th className="py-1 pr-2 font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nameNorm} className="border-b border-neutral-800/80 text-neutral-200">
              <td className="py-1 pr-2 max-w-[200px] truncate" title={r.name}>
                {r.name}
              </td>
              <td className="py-1 pr-2 font-mono">{r.avgRank}</td>
              <td className="py-1 pr-2 font-mono">{r.latestRank ?? '—'}</td>
              <td className="py-1 pr-2 font-mono">{r.daysSeen}</td>
              <td className="py-1 pr-2 font-mono text-[10px]">
                {r.firstRankInWindow ?? '—'} → {r.lastRankInWindow ?? '—'}
              </td>
              <td className="py-1 pr-2 font-mono">
                {r.deltaFirstToLatest == null ? '—' : r.deltaFirstToLatest > 0 ? `+${r.deltaFirstToLatest}` : r.deltaFirstToLatest}
              </td>
              <td className="py-1 pr-2 font-mono">{r.persistenceTop24Pct}%</td>
              <td className="py-1 pr-2 font-mono text-neutral-400">{r.dominanceScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoversTable({ title, rows }: { title: string; rows: MoverRow[] }) {
  if (!rows?.length) {
    return <div className="text-xs text-neutral-500 py-1">{title}: no multi-day movement in window.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="text-[11px] text-neutral-400 mb-1">{title}</div>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-left text-neutral-500 border-b border-neutral-700">
            <th className="py-1 pr-2 font-medium">Name</th>
            <th className="py-1 pr-2 font-medium">Δ rank</th>
            <th className="py-1 pr-2 font-medium">First→last</th>
            <th className="py-1 pr-2 font-medium">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.nameNorm} className="border-b border-neutral-800/80 text-neutral-200">
              <td className="py-1 pr-2 max-w-[200px] truncate">{r.name}</td>
              <td
                className={`py-1 pr-2 font-mono ${
                  r.rankImprovement >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'
                }`}
              >
                {r.rankImprovement > 0 ? `+${r.rankImprovement}` : r.rankImprovement}
              </td>
              <td className="py-1 pr-2 font-mono text-[10px]">
                {r.firstRankInWindow ?? '—'} → {r.lastRankInWindow ?? '—'}
              </td>
              <td className="py-1 pr-2 font-mono">{r.daysSeen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DiscoverMetaRollupsPanel({ data }: { data: DiscoverRollupsPayload | null }) {
  if (!data?.ok) {
    return <div className="text-xs text-neutral-500">Could not load rollups.</div>;
  }

  const w7 = data.windows?.d7;
  const w30 = data.windows?.d30;
  const cmd = data.commanders;
  const cards = data.cards;

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap gap-3 text-[11px] text-neutral-500">
        <span>
          Generated: {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}
        </span>
        {w7 && (
          <span>
            7d: {w7.start} … {w7.end} (UTC)
          </span>
        )}
        {w30 && (
          <span>
            30d: {w30.start} … {w30.end} (UTC)
          </span>
        )}
      </div>
      {data.rowCounts && (
        <div className="text-[11px] text-neutral-500 font-mono">
          Rows loaded — cmd: {data.rowCounts.commanderRows7 ?? 0} / {data.rowCounts.commanderRows30 ?? 0} (7d/30d);
          cards: {data.rowCounts.cardRows7 ?? 0} / {data.rowCounts.cardRows30 ?? 0}; snapshot days (30d):{' '}
          {data.rowCounts.distinctCommanderSnapshotDays30 ?? 0}
        </div>
      )}
      {(data.caveats?.length ?? 0) > 0 && (
        <ul className="list-disc list-inside text-amber-200/90 text-[11px] space-y-0.5">
          {data.caveats!.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-neutral-800 bg-neutral-950/40 p-4">
          <h3 className="text-sm font-medium text-neutral-200 mb-2">Commanders — 7d leaders</h3>
          <LeaderTable
            title="Dominant (avg rank)"
            rows={cmd?.leaders7d ?? []}
            windowLabel="7d"
          />
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-950/40 p-4">
          <h3 className="text-sm font-medium text-neutral-200 mb-2">Commanders — 30d leaders</h3>
          <LeaderTable
            title="Dominant (avg rank)"
            rows={cmd?.leaders30d ?? []}
            windowLabel="30d"
          />
        </div>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-950/40 p-4 space-y-4">
        <h3 className="text-sm font-medium text-neutral-200">Commanders — 7d movers (min 2 days in window)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MoversTable title="Risers (rank improved)" rows={cmd?.movers7d?.risers ?? []} />
          <MoversTable title="Fallers (rank dropped)" rows={cmd?.movers7d?.fallers ?? []} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded border border-neutral-800 bg-neutral-950/40 p-4">
          <h3 className="text-sm font-medium text-neutral-200 mb-2">Cards — 7d leaders (popular window)</h3>
          <LeaderTable title="Dominant cards" rows={cards?.leaders7d ?? []} windowLabel="7d" />
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-950/40 p-4">
          <h3 className="text-sm font-medium text-neutral-200 mb-2">Cards — 30d leaders (popular window)</h3>
          <LeaderTable title="Dominant cards" rows={cards?.leaders30d ?? []} windowLabel="30d" />
        </div>
      </div>

      {data.newSetBreakouts && (
        <div className="rounded border border-neutral-700/60 bg-neutral-900/30 p-3 text-[11px] text-neutral-400 space-y-1">
          <div>
            <span className="text-neutral-300 font-medium">New set breakouts (live / meta-signals): </span>
            {data.newSetBreakouts.message}
          </div>
          {data.newSetBreakouts.debug && (
            <div className="font-mono text-[10px] text-neutral-500">
              window {data.newSetBreakouts.debug.eligibilityDays}d · cutoff {data.newSetBreakouts.debug.cutoffIso} ·
              candidates {data.newSetBreakouts.debug.rawCandidates} · sets {data.newSetBreakouts.debug.distinctSetCodes}{' '}
              · published {data.newSetBreakouts.debug.finalRows}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DiscoverMetaRollupsCompact({ data }: { data: DiscoverRollupsPayload | null }) {
  if (!data?.ok) return null;
  const prev = data.commandCenterPreview;
  if (!prev) return null;
  return (
    <div className="text-[11px] space-y-2 text-neutral-300">
      <div>
        <span className="text-neutral-500">7d cmd leaders: </span>
        {prev.topCommanders7d?.length
          ? prev.topCommanders7d.map((r) => r.name).join(' · ')
          : '—'}
      </div>
      <div>
        <span className="text-neutral-500">7d risers: </span>
        {prev.topMovers7dRisers?.length
          ? prev.topMovers7dRisers.map((r) => `${r.name} (${r.rankImprovement > 0 ? '+' : ''}${r.rankImprovement})`).join(' · ')
          : '—'}
      </div>
    </div>
  );
}
