"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";


type Action = "suggestion" | "rejected" | "ignored" | "meta" | "commander" | "deck-metrics";

const ACTIONS: { action: Action; label: string; description: string }[] = [
  { action: "suggestion", label: "Insert test accepted", description: "Insert one row into ai_suggestion_outcomes (accepted: true, admin_test)." },
  { action: "rejected", label: "Insert test rejected", description: "Insert one row (rejected: true, outcome_source: admin_test)." },
  { action: "ignored", label: "Insert test ignored", description: "Insert one row (ignored: true, outcome_source: admin_test)." },
  { action: "meta", label: "Snapshot meta signals", description: "Copy current meta_signals into meta_signals_history for today." },
  { action: "commander", label: "Snapshot commander aggregates", description: "Copy current commander_aggregates into commander_aggregates_history for today." },
  { action: "deck-metrics", label: "Snapshot one deck metrics", description: "Pick first deck from deck_context_summary and write one row to deck_metrics_snapshot for today." },
];

export default function DataMoatTestPage() {
  const [running, setRunning] = React.useState<Action | null>(null);
  const [result, setResult] = React.useState<{ action: Action; success: boolean; message?: string; deck_id?: string } | null>(null);

  async function run(action: Action) {
    setRunning(action);
    setResult(null);
    try {
      const r = await fetch("/api/admin/datadashboard/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (!r.ok) {
        setResult({ action, success: false, message: j.error || "Request failed" });
        return;
      }
      setResult({
        action,
        success: j.success === true,
        message: j.message,
        deck_id: j.deck_id,
      });
    } catch (e) {
      setResult({ action, success: false, message: (e as Error).message });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Data Moat Test</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Trigger data-moat writes in Supabase to verify tables and permissions. Admin only.
        </p>
        <div className="mt-2 rounded-lg border border-neutral-700 bg-neutral-800/50 p-2">
          <p className="text-xs font-medium text-neutral-300 mb-0.5">ELI5</p>
          <p className="text-xs text-neutral-400">Click Run for each action to push one row (or today’s snapshot) into the four data-moat tables. Then run the SQL below in Supabase to confirm the rows are there.</p>
        </div>
      </div>
      <DataDashboardNav />

      <section className="rounded border border-neutral-800 p-4 space-y-4">
        <h2 className="font-medium">Actions</h2>
        {ACTIONS.map(({ action, label, description }) => (
          <div key={action} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-neutral-500">{description}</div>
              </div>
              <button
                type="button"
                onClick={() => run(action)}
                disabled={running !== null}
                className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 text-sm whitespace-nowrap"
              >
                {running === action ? "Running…" : "Run"}
              </button>
            </div>
          </div>
        ))}
      </section>

      {result && (
        <section className="rounded border border-neutral-800 p-4">
          <h2 className="font-medium mb-2">Last result</h2>
          <div className={`text-sm ${result.success ? "text-green-400" : "text-amber-400"}`}>
            {result.action}: {result.success ? "Success" : "Failed"}
            {result.message != null && result.message !== "" && ` — ${result.message}`}
            {result.deck_id != null && ` (deck_id: ${result.deck_id})`}
          </div>
        </section>
      )}

      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <h2 className="font-medium">SQL to verify in Supabase</h2>
        <p className="text-xs text-neutral-500">After running the 4 actions above, run these in the Supabase SQL editor to confirm rows exist.</p>
        <div className="space-y-3 text-xs">
          <div>
            <p className="font-medium text-neutral-400 mb-1">1. ai_suggestion_outcomes (test row with outcome_source = &apos;admin_test&apos;)</p>
            <pre className="p-2 rounded bg-neutral-900 border border-neutral-700 overflow-x-auto font-mono whitespace-pre-wrap break-all">
{`SELECT id, suggestion_id, suggested_card, category, outcome_source, created_at
FROM ai_suggestion_outcomes
WHERE outcome_source = 'admin_test'
ORDER BY created_at DESC
LIMIT 10;`}
            </pre>
          </div>
          <div>
            <p className="font-medium text-neutral-400 mb-1">2. meta_signals_history (today’s snapshots)</p>
            <pre className="p-2 rounded bg-neutral-900 border border-neutral-700 overflow-x-auto font-mono whitespace-pre-wrap break-all">
{`SELECT id, snapshot_date, signal_type, created_at
FROM meta_signals_history
WHERE snapshot_date = CURRENT_DATE
ORDER BY signal_type;`}
            </pre>
          </div>
          <div>
            <p className="font-medium text-neutral-400 mb-1">3. commander_aggregates_history (today’s snapshots)</p>
            <pre className="p-2 rounded bg-neutral-900 border border-neutral-700 overflow-x-auto font-mono whitespace-pre-wrap break-all">
{`SELECT id, snapshot_date, commander_slug, deck_count, created_at
FROM commander_aggregates_history
WHERE snapshot_date = CURRENT_DATE
ORDER BY deck_count DESC NULLS LAST
LIMIT 10;`}
            </pre>
          </div>
          <div>
            <p className="font-medium text-neutral-400 mb-1">4. deck_metrics_snapshot (today’s rows)</p>
            <pre className="p-2 rounded bg-neutral-900 border border-neutral-700 overflow-x-auto font-mono whitespace-pre-wrap break-all">
{`SELECT deck_id, snapshot_date, format, commander, land_count, ramp_count, removal_count, draw_count, created_at
FROM deck_metrics_snapshot
WHERE snapshot_date = CURRENT_DATE
ORDER BY created_at DESC
LIMIT 10;`}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
