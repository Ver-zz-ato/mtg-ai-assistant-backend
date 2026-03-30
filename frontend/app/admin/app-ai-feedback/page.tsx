"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAppFeaturePageLabel } from "@/lib/ai/app-feature-labels";

type ContextJsonb = {
  source?: string;
  chat_surface?: string | null;
  page_path?: string | null;
  prompt_version_id?: string | null;
  deck_id?: string | null;
  commander_name?: string | null;
  format?: string | null;
  correction_text?: string | null;
  better_cards_text?: string | null;
};

type ReportRow = {
  id: string;
  created_at: string;
  status: string;
  issue_types: string[];
  description: string | null;
  thread_id: string | null;
  message_id: string | null;
  user_id: string | null;
  context_jsonb: ContextJsonb | null;
  admin_notes: string | null;
};

type Summary = {
  confirmedAppStructuredReports: number;
  byStatus: Record<string, number>;
  latestConfirmedAt: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-700",
  reviewed: "bg-blue-700",
  resolved: "bg-emerald-700",
  dismissed: "bg-neutral-600",
};

export default function AppAIFeedbackAdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [totalMatching, setTotalMatching] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        limit: "50",
        offset: "0",
      });
      if (issueTypeFilter.trim()) params.set("issueType", issueTypeFilter.trim());
      // Same-origin admin route; fetchJson() uses apiUrl() for external API prefix.
      // eslint-disable-next-line no-restricted-globals -- intentional: GET /api/admin/*
      const r = await fetch(`/api/admin/app-ai-feedback?${params}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        console.error(j);
        setSummary(null);
        setReports([]);
        setTotalMatching(0);
        return;
      }
      setSummary(j.summary);
      setReports(j.reports || []);
      setTotalMatching(j.totalMatchingFilters ?? 0);
    } catch (e) {
      console.error(e);
      setSummary(null);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, issueTypeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 max-w-7xl mx-auto text-neutral-100">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">App-only AI feedback</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/feedback-dashboard" className="text-amber-400 hover:underline">
            Feedback dashboard
          </Link>
          <span className="text-neutral-500">·</span>
          <Link href="/admin/ai-reports" className="text-amber-400 hover:underline">
            All AI reports (triage)
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-neutral-200 space-y-2">
        <p className="font-medium text-amber-200/90">What this page includes</p>
        <ul className="list-disc pl-5 space-y-1 text-neutral-300">
          <li>
            <strong className="text-neutral-200">Confirmed app structured reports</strong> — rows in{" "}
            <code className="text-neutral-400">ai_response_reports</code> where the app submitted a{" "}
            <em>chat correction</em> and stored <code className="text-neutral-400">chat_surface</code>{" "}
            with the <code className="text-neutral-400">app_</code> prefix. The website chat correction
            flow only uses <code className="text-neutral-400">main_chat</code> and{" "}
            <code className="text-neutral-400">deck_chat</code>, so this filter is a reliable separator
            for native corrections captured that way.
          </li>
        </ul>
        <p className="font-medium text-amber-200/90 pt-1">What this page does not include</p>
        <ul className="list-disc pl-5 space-y-1 text-neutral-300">
          <li>
            <strong className="text-neutral-200">Chat “report issue” (flag)</strong> submissions — the
            API does not persist <code className="text-neutral-400">context_jsonb</code> for those rows,
            so app and website reports look the same in SQL. Use PostHog or a future DB field if you need
            to split them.
          </li>
          <li>
            <strong className="text-neutral-200">Thumbs / generic feedback</strong> — the{" "}
            <code className="text-neutral-400">feedback</code> table does not store{" "}
            <code className="text-neutral-400">source</code> (only PostHog may include it). App thumbs and
            analyze usefulness cannot be isolated as app-only from Supabase alone.
          </li>
        </ul>
        <p className="text-xs text-neutral-500 pt-1">
          Recommendation: persist <code className="text-neutral-400">source</code> (and optionally{" "}
          <code className="text-neutral-400">client</code>) on <code className="text-neutral-400">feedback</code>{" "}
          and attach a client/surface object to all <code className="text-neutral-400">ai_response_reports</code>{" "}
          inserts if you need full app vs web breakdown in admin.
        </p>
      </div>

      {loading && !summary ? (
        <div className="text-neutral-400">Loading…</div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <StatCard
              label="Confirmed app reports"
              value={summary.confirmedAppStructuredReports}
              hint="chat_correction + app_* surface"
            />
            <StatCard label="Pending" value={summary.byStatus.pending ?? 0} />
            <StatCard label="Reviewed" value={summary.byStatus.reviewed ?? 0} />
            <StatCard label="Resolved" value={summary.byStatus.resolved ?? 0} />
            <StatCard label="Dismissed" value={summary.byStatus.dismissed ?? 0} />
          </div>
          <div className="text-xs text-neutral-500 mb-4">
            Latest confirmed app correction:{" "}
            {summary.latestConfirmedAt
              ? new Date(summary.latestConfirmedAt).toLocaleString()
              : "—"}
          </div>
        </>
      ) : (
        <div className="text-red-400 mb-4">Could not load summary.</div>
      )}

      <section className="mb-4 space-y-3">
        <h2 className="text-lg font-semibold">Confirmed app structured reports</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-neutral-400">Status:</span>
          {["all", "pending", "reviewed", "resolved", "dismissed"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded text-sm capitalize ${
                statusFilter === s ? "bg-amber-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"
              }`}
            >
              {s}
            </button>
          ))}
          <span className="text-sm text-neutral-400 ml-2">Issue type contains:</span>
          <input
            value={issueTypeFilter}
            onChange={(e) => setIssueTypeFilter(e.target.value)}
            placeholder="e.g. bad_recommendation"
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm w-48"
          />
        </div>

        {loading ? (
          <div className="text-neutral-400 py-8">Loading table…</div>
        ) : reports.length === 0 ? (
          <div className="rounded border border-neutral-700 bg-neutral-900/50 px-4 py-8 text-neutral-400 text-center">
            No rows match the current filters. Either nothing has been filed yet, or app reports use the
            flag flow (not stored as app-identified here).
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700 bg-neutral-900 text-left text-neutral-400">
                  <th className="p-2 whitespace-nowrap">Created</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Issues</th>
                  <th className="p-2 min-w-[140px]">Description</th>
                  <th className="p-2">Thread</th>
                  <th className="p-2">Message</th>
                  <th className="p-2">User</th>
                  <th className="p-2">Surface / context</th>
                  <th className="p-2">Prompt ver.</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const ctx = r.context_jsonb;
                  const surface = ctx?.chat_surface ?? "";
                  const surfaceLabel = surface.startsWith("app_") ? getAppFeaturePageLabel(surface) : surface || "—";
                  return (
                    <tr key={r.id} className="border-b border-neutral-800/80 hover:bg-neutral-900/60 align-top">
                      <td className="p-2 whitespace-nowrap text-neutral-400">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded text-white ${
                            STATUS_BADGE[r.status] ?? "bg-neutral-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {(r.issue_types || []).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 max-w-xs text-neutral-300">
                        {r.description ? (
                          <span className="line-clamp-3">{r.description}</span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-neutral-500 max-w-[100px] truncate" title={r.thread_id ?? ""}>
                        {r.thread_id ?? "—"}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-neutral-500 max-w-[100px] truncate" title={r.message_id ?? ""}>
                        {r.message_id ?? "—"}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-neutral-500 max-w-[120px] truncate" title={r.user_id ?? ""}>
                        {r.user_id ?? "—"}
                      </td>
                      <td className="p-2 text-xs text-neutral-300 min-w-[160px]">
                        <div>
                          <span className="text-neutral-500">surface:</span> {surface || "—"}
                        </div>
                        {surface.startsWith("app_") && surfaceLabel !== surface && (
                          <div className="text-neutral-500">{surfaceLabel}</div>
                        )}
                        {ctx?.page_path != null && ctx.page_path !== "" && (
                          <div>
                            <span className="text-neutral-500">path:</span> {ctx.page_path}
                          </div>
                        )}
                        {ctx?.deck_id != null && String(ctx.deck_id).length > 0 && (
                          <div className="truncate" title={String(ctx.deck_id)}>
                            <span className="text-neutral-500">deck:</span> {String(ctx.deck_id).slice(0, 12)}…
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-neutral-400">
                        {ctx?.prompt_version_id ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3 py-2 text-xs text-neutral-500 border-t border-neutral-800">
              Showing {reports.length} of {totalMatching} matching filters. Update status in{" "}
              <Link href="/admin/ai-reports" className="text-amber-500 hover:underline">
                AI reports
              </Link>
              .
            </div>
          </div>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
        <h2 className="text-lg font-semibold mb-2 text-neutral-200">Generic app feedback (Supabase limits)</h2>
        <p className="text-sm text-neutral-400 mb-2">
          Thumbs, optional comments from <code className="text-neutral-500">/api/feedback</code>, and similar
          events do not write <code className="text-neutral-500">source</code> into the{" "}
          <code className="text-neutral-500">feedback</code> table, even though clients may send a{" "}
          <code className="text-neutral-500">source</code> field for analytics. There is no honest
          “app-only” row set to query here without a schema change or PostHog.
        </p>
        <p className="text-sm text-neutral-400">
          Analyze-deck usefulness may share <code className="text-neutral-500">deck_analysis</code> (or other
          labels) with the website in analytics only — not persisted on the row — so this admin view
          deliberately omits blended totals.
        </p>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[10px] text-neutral-600 mt-1">{hint}</div>}
    </div>
  );
}
