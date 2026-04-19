'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AdminGenericJobRunHistory,
  AdminJobDetailSummary,
} from '@/components/admin/AdminGenericJobRunHistory';
import type { AdminJobDetail } from '@/lib/admin/adminJobDetail';

type JobPayload = {
  health: string;
  lastSuccess: string | null;
  lastAttempt: string | null;
  latest: AdminJobDetail | null;
  history: Array<{
    id: string;
    job_name: string;
    started_at: string;
    finished_at: string;
    duration_ms: number | null;
    ok: boolean;
    run_result: string | null;
    compact_summary: string;
    summary_json: AdminJobDetail;
  }>;
};

const JOB_META: Record<
  string,
  { title: string; subtitle?: string; anchor: string }
> = {
  'deck-costs': {
    title: 'deck-costs',
    subtitle: 'deck_costs totals for public Commander decks',
    anchor: 'job-deck-costs',
  },
  'commander-aggregates': {
    title: 'commander-aggregates',
    subtitle: 'commander_aggregates (top cards, median cost, recent decks)',
    anchor: 'job-commander-aggregates',
  },
  'top-cards': {
    title: 'top-cards',
    subtitle: 'Global top_cards table for commander pages',
    anchor: 'job-top-cards',
  },
  bulk_scryfall: {
    title: 'bulk_scryfall',
    subtitle: 'scryfall_cache from default_cards bulk',
    anchor: 'job-bulk-scryfall',
  },
  bulk_price_import: {
    title: 'bulk_price_import',
    subtitle: 'price_cache from bulk prices',
    anchor: 'job-bulk-price',
  },
  price_snapshot_bulk: {
    title: 'price_snapshot_bulk',
    subtitle: 'price_snapshots daily rows (USD/EUR/GBP)',
    anchor: 'job-price-snapshot',
  },
  'budget-swaps-update': {
    title: 'budget-swaps-update',
    subtitle: 'app_config.budget_swaps AI suggestions',
    anchor: 'job-budget-swaps',
  },
  daily_ops_report: {
    title: 'Daily ops report',
    subtitle: 'ops_reports daily_ops — Discord + /admin/ops',
    anchor: 'job-daily-ops',
  },
  weekly_ops_report: {
    title: 'Weekly ops report',
    subtitle: 'ops_reports weekly_ops',
    anchor: 'job-weekly-ops',
  },
};

export function AdminJobInspectorHub({
  jobIds,
  showCommandCenterHint,
}: {
  jobIds: string[];
  showCommandCenterHint?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<{
    ok: boolean;
    jobs: Record<string, JobPayload>;
    tableMissing?: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = jobIds.join(',');
        const r = await fetch(`/api/admin/admin-job-inspector?jobs=${encodeURIComponent(q)}`, {
          cache: 'no-store',
        });
        const j = await r.json();
        if (!cancelled) setPayload(j);
      } catch {
        if (!cancelled) setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobIds.join(',')]);

  if (loading) {
    return <div className="text-sm text-neutral-500 py-4">Loading job inspector…</div>;
  }
  if (!payload?.ok) {
    return <div className="text-sm text-rose-400/90">Could not load admin job inspector.</div>;
  }

  return (
    <div id="admin-job-inspector" className="space-y-4">
      {showCommandCenterHint && (
        <p className="text-[11px] text-neutral-500">
          Same data as Command Center cards, with expandable run history. Requires migration{' '}
          <code className="bg-black/40 px-1 rounded">099</code> for SQL logs.
        </p>
      )}
      {payload.tableMissing && (
        <div className="rounded border border-amber-800/50 bg-amber-950/25 p-3 text-[11px] text-amber-100/90">
          {payload.message}
        </div>
      )}
      {jobIds.map((id) => {
        const meta = JOB_META[id] ?? { title: id, anchor: `job-${id}` };
        const j = payload.jobs[id];
        if (!j) return null;
        return (
          <details
            key={id}
            id={meta.anchor}
            className="rounded border border-neutral-800 bg-neutral-950/40 scroll-mt-24"
          >
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900/60 flex flex-wrap items-center justify-between gap-2">
              <span>
                {meta.title}
                <span
                  className={`ml-2 font-mono text-xs ${
                    j.health === 'healthy'
                      ? 'text-emerald-400'
                      : j.health === 'stale'
                        ? 'text-amber-400'
                        : j.health === 'failed'
                          ? 'text-rose-400'
                          : 'text-yellow-300'
                  }`}
                >
                  {j.health}
                </span>
              </span>
              <Link
                href="/admin/JustForDavy/command-center"
                className="text-[10px] text-blue-400 hover:text-blue-300 font-normal"
                onClick={(e) => e.stopPropagation()}
              >
                Command Center →
              </Link>
            </summary>
            <div className="px-3 pb-3 border-t border-neutral-800 space-y-3">
              {meta.subtitle && <p className="text-[11px] text-neutral-500 pt-2">{meta.subtitle}</p>}
              <AdminJobDetailSummary
                detail={j.latest}
                health={j.health}
                lastSuccess={j.lastSuccess}
                lastAttempt={j.lastAttempt}
              />
              <details className="rounded border border-neutral-800/80 bg-black/20">
                <summary className="cursor-pointer px-2 py-1.5 text-[11px] text-neutral-400 hover:text-neutral-300">
                  Recent runs (newest first)
                </summary>
                <div className="px-2 pb-2 pt-0">
                  <AdminGenericJobRunHistory
                    runs={j.history}
                    tableMissing={payload.tableMissing}
                    message={payload.message}
                  />
                </div>
              </details>
            </div>
          </details>
        );
      })}
    </div>
  );
}
