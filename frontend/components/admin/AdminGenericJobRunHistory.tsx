'use client';

import React from 'react';
import type { AdminJobDetail, AdminJobRunLogRow } from '@/lib/admin/adminJobDetail';

function fmtUtc(ts: string) {
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return ts;
  }
}

function healthClass(h: string) {
  if (h === 'healthy') return 'text-emerald-400';
  if (h === 'stale') return 'text-amber-400';
  if (h === 'degraded' || h === 'partial') return 'text-yellow-300';
  if (h === 'failed') return 'text-rose-400';
  return 'text-neutral-400';
}

export function AdminJobDetailSummary({
  detail,
  health,
  lastSuccess,
  lastAttempt,
  compact,
}: {
  detail: AdminJobDetail | null;
  health?: string;
  lastSuccess?: string | null;
  lastAttempt?: string | null;
  compact?: boolean;
}) {
  if (!detail && !lastSuccess && !lastAttempt) {
    return <div className="text-[11px] text-neutral-500">No job detail yet — run once after migration 099.</div>;
  }

  return (
    <div className={`space-y-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
      {health && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
          <span className="text-neutral-500">Status</span>
          <span className={`font-mono ${healthClass(health)}`}>{health}</span>
        </div>
      )}
      {(lastSuccess || lastAttempt) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-neutral-400">
          {lastSuccess && (
            <div>
              <span className="text-neutral-500">Last success · </span>
              {fmtUtc(lastSuccess)}
            </div>
          )}
          {lastAttempt && lastAttempt !== lastSuccess && (
            <div>
              <span className="text-neutral-500">Last attempt · </span>
              {fmtUtc(lastAttempt)}
            </div>
          )}
        </div>
      )}
      {detail?.compactLine && (
        <div className="text-neutral-200 leading-snug border border-neutral-800 rounded px-2 py-1.5 bg-neutral-950/50">
          {detail.compactLine}
        </div>
      )}
      {detail?.destination && (
        <div className="text-neutral-500">
          <span className="text-neutral-600">Writes to </span>
          <code className="bg-black/40 px-1 rounded text-neutral-300">{detail.destination}</code>
          {detail.source && (
            <>
              <span className="text-neutral-600"> · source </span>
              <span className="text-neutral-400">{detail.source}</span>
            </>
          )}
        </div>
      )}
      {detail?.warnings && detail.warnings.length > 0 && (
        <div className="rounded border border-amber-800/40 bg-amber-950/20 px-2 py-1 text-amber-100/90">
          <div className="text-neutral-500 text-[10px] mb-0.5">Warnings ({detail.warnings.length})</div>
          <ul className="list-disc list-inside space-y-0.5">
            {detail.warnings.slice(0, 6).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {detail?.lastError && (
        <div className="rounded border border-rose-800/40 bg-rose-950/20 px-2 py-1 text-rose-100/90">{detail.lastError}</div>
      )}
    </div>
  );
}

export function AdminGenericJobRunHistory({
  runs,
  tableMissing,
  message,
}: {
  runs: AdminJobRunLogRow[] | null | undefined;
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
      <div className="text-[11px] text-neutral-500 py-2">No logged runs yet for this job.</div>
    );
  }

  return (
    <div className="space-y-1">
      {runs.map((run) => {
        const detail = run.summary_json as AdminJobDetail | undefined;
        const rr = run.run_result ?? (run.ok ? 'success' : 'failed');
        const header = run.compact_summary || `${fmtUtc(run.finished_at)} · ${rr}`;
        const wc = detail?.warnings?.length ?? 0;
        return (
          <details key={run.id} className="rounded border border-neutral-800 bg-neutral-950/50 group">
            <summary className="cursor-pointer px-3 py-2 text-[11px] text-neutral-200 hover:bg-neutral-900/80 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
              <span className="font-mono text-[10px] text-neutral-400 shrink-0">
                {run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s` : '—'}
              </span>
              <span className="text-neutral-300 min-w-0 flex-1">{header}</span>
              <span className="text-neutral-500 shrink-0">{wc} warn</span>
            </summary>
            <div className="px-3 pb-3 pt-0 border-t border-neutral-800/80 space-y-2">
              {detail ? (
                <>
                  <AdminJobDetailSummary detail={detail} compact />
                  <details className="text-[10px] text-neutral-500">
                    <summary className="cursor-pointer hover:text-neutral-400">Structured detail (JSON)</summary>
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
