'use client';

import React from 'react';
import type { MetaSignalsJobDetail } from '@/lib/meta/metaSignalsJobStatus';

function badgeClass(run?: string) {
  switch (run) {
    case 'success':
      return 'bg-emerald-900/50 text-emerald-200 border-emerald-700';
    case 'fallback':
      return 'bg-amber-900/50 text-amber-200 border-amber-700';
    case 'partial':
      return 'bg-amber-900/50 text-amber-100 border-amber-600';
    case 'failed':
      return 'bg-rose-900/50 text-rose-100 border-rose-700';
    default:
      return 'bg-neutral-800 text-neutral-200 border-neutral-600';
  }
}

export function MetaSignalsJobSummary({
  detail,
  compact,
  className = '',
}: {
  detail: MetaSignalsJobDetail | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!detail) return null;
  const rr = detail.runResult ?? (detail.ok ? 'success' : 'failed');
  const dh = detail.dailyHistory;

  if (compact) {
    return (
      <div className={`text-[11px] space-y-1 ${className}`}>
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`px-1.5 py-0.5 rounded border font-mono ${badgeClass(rr)}`}>{rr}</span>
          {detail.durationMs != null && detail.durationMs >= 0 && (
            <>
              <span className="text-neutral-400">duration</span>
              <span className="font-mono text-neutral-200">{(detail.durationMs / 1000).toFixed(1)}s</span>
              <span className="text-neutral-500">|</span>
            </>
          )}
          <span className="text-neutral-400">mode</span>
          <span className="font-mono text-neutral-200">{detail.pillMode}</span>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400">daily</span>
          <span className="font-mono text-neutral-200">
            {dh?.commanderRowsUpserted ?? 0} cmd / {dh?.cardRowsUpserted ?? 0} card
          </span>
          <span className="text-neutral-500">|</span>
          <span className="text-neutral-400">yday ranks</span>
          <span className="font-mono">{detail.yesterdayRanksAvailable ? 'yes' : 'no'}</span>
        </div>
        {detail.trendingDiff?.movers && detail.trendingDiff.movers.length > 0 && (
          <div className="text-neutral-400 truncate">
            Movers:{' '}
            {detail.trendingDiff.movers.map((m) => (
              <span key={m.name} className="text-neutral-300 mr-2">
                {m.name} {m.label}
              </span>
            ))}
          </div>
        )}
        {(detail.warnings?.length ?? 0) > 0 && (
          <div className="text-amber-200/90">⚠ {detail.warnings?.length} warning(s)</div>
        )}
      </div>
    );
  }

  const fmtUtc = (ts?: string) =>
    ts
      ? new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      : '—';

  return (
    <div className={`rounded border border-emerald-900/50 bg-black/30 p-3 space-y-2 text-xs ${className}`}>
      {(detail.attemptStartedAt || detail.finishedAt) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] border-b border-neutral-800/80 pb-2 mb-1">
          <div>
            <div className="text-neutral-500">Started (UTC)</div>
            <div className="font-mono text-neutral-200">{fmtUtc(detail.attemptStartedAt)}</div>
          </div>
          <div>
            <div className="text-neutral-500">Finished (UTC)</div>
            <div className="font-mono text-neutral-200">{fmtUtc(detail.finishedAt)}</div>
          </div>
          <div>
            <div className="text-neutral-500">Duration</div>
            <div className="font-mono text-neutral-200">
              {detail.durationMs != null && detail.durationMs >= 0
                ? `${(detail.durationMs / 1000).toFixed(2)}s`
                : '—'}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-baseline">
        <span className="text-neutral-400">Run</span>
        <span className={`px-2 py-0.5 rounded border font-mono text-[11px] ${badgeClass(rr)}`}>{rr}</span>
        <span className="text-neutral-500">·</span>
        <span className="text-neutral-400">Mode</span>
        <span className="font-mono text-emerald-200/90">{detail.pillMode}</span>
        <span className="text-neutral-500">·</span>
        <span className="text-neutral-400">Snapshot</span>
        <span className="font-mono text-neutral-200">{detail.snapshotDate}</span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-400">
        <span>
          Sections changed:{' '}
          <span className="font-mono text-neutral-200">{detail.changedSectionsCount ?? '—'}</span>
        </span>
        <span>
          meta_signals writes:{' '}
          <span className="font-mono text-neutral-200">{detail.metaSignalsUpserts ?? '—'}</span>
        </span>
        <span>
          Warnings:{' '}
          <span className="font-mono text-neutral-200">{detail.warnings?.length ?? 0}</span>
        </span>
      </div>

      {detail.sourcesLine && (
        <div>
          <span className="text-neutral-500">Sources: </span>
          <span className="text-neutral-200">{detail.sourcesLine}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <div className="text-neutral-500 mb-0.5">Daily history (Supabase)</div>
          <div className="font-mono text-[11px] text-neutral-200">
            meta_commander_daily upserted: {dh?.commanderRowsUpserted ?? 0} rows
            <br />
            meta_card_daily upserted: {dh?.cardRowsUpserted ?? 0} rows
            <br />
            yesterday rank history: {detail.yesterdayRanksAvailable ? 'available' : 'not available'}
          </div>
        </div>
        <div>
          <div className="text-neutral-500 mb-0.5">Fallback / prior snapshot</div>
          <div className="font-mono text-[11px] text-neutral-200">
            fallbackUsed: {String(detail.fallbackUsed)}
            {detail.priorSnapshotUsedFor?.length ? (
              <>
                <br />
                prior used for: {detail.priorSnapshotUsedFor.join(', ')}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {detail.newSetBreakoutsDebug && (
        <div className="rounded border border-sky-900/40 bg-sky-950/20 p-2">
          <div className="text-sky-200/90 font-medium text-[11px] mb-1">New set breakouts (date eligibility)</div>
          <div className="font-mono text-[11px] text-neutral-300 space-y-0.5">
            <div>
              Window:{' '}
              <span className="text-neutral-100">{detail.newSetBreakoutsDebug.eligibilityDays}d</span> · cutoff{' '}
              {detail.newSetBreakoutsDebug.cutoffIso}
            </div>
            <div>
              Candidates (raw): {detail.newSetBreakoutsDebug.rawCandidates} · distinct set codes:{' '}
              {detail.newSetBreakoutsDebug.distinctSetCodes} · final rows: {detail.newSetBreakoutsDebug.finalRows}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="text-neutral-500 mb-1">Sections</div>
        <ul className="font-mono text-[11px] text-neutral-300 space-y-0.5">
          {Object.entries(detail.sectionCounts ?? {}).map(([k, n]) => {
            const s = detail.sectionSummaries?.[k];
            const status =
              s?.changed === true ? 'changed' : s?.changed === false ? 'unchanged' : '—';
            const note = s?.note ? ` — ${s.note}` : '';
            return (
              <li key={k}>
                {k}: {n} rows — {status}
                {note}
              </li>
            );
          })}
        </ul>
      </div>

      {detail.trendingDiff &&
        (detail.trendingDiff.additions?.length > 0 ||
          detail.trendingDiff.removals?.length > 0 ||
          detail.trendingDiff.movers?.length > 0) && (
          <div>
            <div className="text-neutral-500 mb-1">Trending commanders (vs prior snapshot)</div>
            <div className="text-[11px] text-neutral-200 space-y-1">
              {detail.trendingDiff.additions && detail.trendingDiff.additions.length > 0 && (
                <div>
                  <span className="text-emerald-500/90">Added: </span>
                  {detail.trendingDiff.additions.join(', ')}
                </div>
              )}
              {detail.trendingDiff.removals && detail.trendingDiff.removals.length > 0 && (
                <div>
                  <span className="text-rose-400/90">Removed: </span>
                  {detail.trendingDiff.removals.join(', ')}
                </div>
              )}
              {detail.trendingDiff.movers && detail.trendingDiff.movers.length > 0 && (
                <div>
                  <span className="text-sky-400/90">Movers: </span>
                  {detail.trendingDiff.movers.map((m) => `${m.name} ${m.label}`).join(' · ')}
                </div>
              )}
            </div>
          </div>
        )}

      {(detail.warnings?.length ?? 0) > 0 && (
        <div className="rounded border border-amber-800/50 bg-amber-950/30 p-2">
          <div className="text-amber-200/90 font-medium text-[11px] mb-1">Warnings</div>
          <ul className="list-disc list-inside text-[11px] text-amber-100/85">
            {detail.warnings!.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {detail.humanDetail && (
        <pre className="text-[10px] text-neutral-500 whitespace-pre-wrap font-mono border-t border-neutral-800 pt-2 mt-1">
          {detail.humanDetail}
        </pre>
      )}
    </div>
  );
}
