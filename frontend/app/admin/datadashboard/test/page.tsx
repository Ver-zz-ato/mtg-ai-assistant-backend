"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";

type Action = "suggestion" | "meta" | "commander" | "deck-metrics";

const ACTIONS: { action: Action; label: string; description: string }[] = [
  { action: "suggestion", label: "Insert test suggestion outcome", description: "Insert one row into ai_suggestion_outcomes (accepted, admin_test)." },
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
    </div>
  );
}
