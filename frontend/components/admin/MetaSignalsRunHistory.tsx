'use client';

import React from 'react';
import { MetaSignalsJobSummary } from '@/components/admin/MetaSignalsJobSummary';
import type { MetaSignalsJobDetail } from '@/lib/meta/metaSignalsJobStatus';
import type { MetaSignalsRunLogRow } from '@/lib/meta/metaSignalsRunHistory';

function fmtUtc(ts: string) {
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return ts;
  }
}

export function MetaSignalsRunHistory({
  runs,
  tableMissing,
  message,
}: {
  runs: MetaSignalsRunLogRow[] | null | undefined;
  tableMissing?: boolean;
  message?: string;
}) {
  if (tableMissing) {
    return (
      <div className="rounded border border-amber-800/50 bg-amber-950/25 p-3 text-[11px] text-amber-100/90">
        {message ?? 'Run history table not available.'}
      </div>
    );
  }
  if (!runs?.length) {
    return (
      <div className="text-[11px] text-neutral-500 py-2">
        No logged runs yet. History is recorded after each meta-signals completion once the database migration is applied.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {runs.map((run) => {
        const detail = run.summary_json as MetaSignalsJobDetail | undefined;
        const rr = run.run_result ?? (run.ok ? 'success' : 'failed');
        const daily =
          (detail?.dailyHistory?.commanderRowsUpserted ?? 0) + (detail?.dailyHistory?.cardRowsUpserted ?? 0);
        const wc = detail?.warnings?.length ?? 0;
        const header = run.compact_summary || `${fmtUtc(run.finished_at)} · ${rr} · ${run.pill_mode ?? '—'}`;
        return (
          <details
            key={run.id}
            className="rounded border border-neutral-800 bg-neutral-950/50 group"
          >
            <summary className="cursor-pointer px-3 py-2 text-[11px] text-neutral-200 hover:bg-neutral-900/80 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
              <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                {run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
              </span>
              <span className="text-neutral-300 min-w-0 flex-1">{header}</span>
              <span className="text-neutral-500 shrink-0">
                {daily} daily · {wc} warn
              </span>
            </summary>
            <div className="px-3 pb-3 pt-0 border-t border-neutral-800/80 space-y-2">
              {detail ? (
                <>
                  <MetaSignalsJobSummary detail={detail} />
                  <details className="text-[10px] text-neutral-500">
                    <summary className="cursor-pointer hover:text-neutral-400">Raw summary JSON</summary>
                    <pre className="mt-1 bg-black/40 rounded p-2 overflow-auto max-h-48 text-[10px]">
                      {JSON.stringify(detail, null, 2)}
                    </pre>
                  </details>
                </>
              ) : (
                <div className="text-[11px] text-neutral-500">No summary payload.</div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
