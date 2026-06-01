"use client";

import React from "react";
import Link from "next/link";

type ReportStatus = "open" | "reviewed" | "resolved" | "dismissed";
type ModerationActionType = "warn" | "ban" | "unban" | "note";

type ReportRow = {
  id: string;
  reporter_user_id: string;
  subject_type: string;
  subject_id: string;
  target_user_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  context_jsonb: Record<string, unknown> | null;
  created_at: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reporter: { id: string; email: string | null; username: string | null } | null;
  targetUser: {
    id: string;
    email: string | null;
    username: string | null;
    moderation: { warning_count: number; is_banned: boolean; banned_until: string | null } | null;
  } | null;
  reviewedByUser: { id: string; email: string | null; username: string | null } | null;
};

const STATUS_BUTTONS: Array<ReportStatus | "all"> = ["open", "reviewed", "resolved", "dismissed", "all"];
const BAN_DURATIONS = [
  { value: "7", label: "Ban 7d" },
  { value: "30", label: "Ban 30d" },
  { value: "permanent", label: "Permanent" },
];

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "-";
  return new Date(value).toLocaleString();
}

function buildBanUntil(duration: string) {
  if (duration === "permanent") return null;
  const days = Number(duration);
  if (!Number.isFinite(days) || days <= 0) return null;
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export default function ModerationAdminPage() {
  const [reports, setReports] = React.useState<ReportRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<ReportStatus | "all">("open");
  const [selectedReportId, setSelectedReportId] = React.useState<string | null>(null);
  const [adminNotes, setAdminNotes] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [banDuration, setBanDuration] = React.useState("7");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const selectedReport = React.useMemo(
    () => reports.find((report) => report.id === selectedReportId) || null,
    [reports, selectedReportId]
  );

  const fetchReports = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: "60" });
      const response = await fetch(`/api/admin/moderation/reports?${params.toString()}`);
      const json = await response.json();
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.error || "Failed to load reports");
      }
      setReports(json.reports || []);
      if (selectedReportId && !(json.reports || []).some((report: ReportRow) => report.id === selectedReportId)) {
        setSelectedReportId(null);
      }
    } catch (e: any) {
      setNotice({ type: "error", message: e?.message || "Failed to load reports." });
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [selectedReportId, statusFilter]);

  React.useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  React.useEffect(() => {
    setAdminNotes(selectedReport?.admin_notes || "");
    setReason(selectedReport?.reason || "");
    setDetails(selectedReport?.details || "");
  }, [selectedReport]);

  async function updateReport(status: ReportStatus) {
    if (!selectedReport) return;
    setBusy("report");
    setNotice(null);
    try {
      const response = await fetch("/api/admin/moderation/reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId: selectedReport.id,
          status,
          adminNotes,
        }),
      });
      const json = await response.json();
      if (!response.ok || json?.ok === false) throw new Error(json?.error || "Failed to update report");
      setNotice({ type: "success", message: `Report marked ${status}.` });
      await fetchReports();
    } catch (e: any) {
      setNotice({ type: "error", message: e?.message || "Failed to update report." });
    } finally {
      setBusy(null);
    }
  }

  async function takeAction(actionType: ModerationActionType) {
    if (!selectedReport?.targetUser?.id) return;
    setBusy(actionType);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/users/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: selectedReport.targetUser.id,
          actionType,
          reason,
          details,
          reportId: selectedReport.id,
          bannedUntil: actionType === "ban" ? buildBanUntil(banDuration) : null,
        }),
      });
      const json = await response.json();
      if (!response.ok || json?.ok === false) throw new Error(json?.error || "Failed to apply moderation action");
      setNotice({ type: "success", message: `${actionType} saved for ${selectedReport.targetUser.email || selectedReport.targetUser.id}.` });
      await fetchReports();
    } catch (e: any) {
      setNotice({ type: "error", message: e?.message || "Failed to save moderation action." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
            ← Admin
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Moderation Queue</h1>
          <p className="text-sm text-neutral-400">Review public profile/share/comment reports, then warn or ban repeat offenders.</p>
        </div>
        <Link href="/admin/support" className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-900 text-sm">
          User Support
        </Link>
      </div>

      {notice && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
              : "border-red-700 bg-red-950/40 text-red-200"
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {STATUS_BUTTONS.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1 rounded capitalize text-sm ${
              statusFilter === status ? "bg-amber-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-neutral-400">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4 text-neutral-400">No reports found for this filter.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded border border-neutral-800 bg-neutral-900/40 max-h-[75vh] overflow-y-auto">
            {reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelectedReportId(report.id)}
                className={`w-full text-left p-3 border-b border-neutral-800 last:border-b-0 transition-colors ${
                  selectedReportId === report.id ? "bg-neutral-800/90" : "hover:bg-neutral-800/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-neutral-100">{report.reason}</span>
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">{report.status}</span>
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {report.subject_type} · {report.resource_type || "n/a"}
                </div>
                <div className="text-xs text-neutral-400 mt-1 truncate">
                  Target: {report.targetUser?.email || report.targetUser?.username || report.target_user_id || "unknown"}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">{fmtDate(report.created_at)}</div>
              </button>
            ))}
          </section>

          <section className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
            {!selectedReport ? (
              <div className="text-neutral-400">Select a report to inspect details and take action.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 text-sm space-y-1">
                    <div className="font-medium text-neutral-100">Reported item</div>
                    <div>Reason: <span className="text-neutral-300">{selectedReport.reason}</span></div>
                    <div>Subject: <span className="text-neutral-300">{selectedReport.subject_type}</span></div>
                    <div>Resource: <span className="text-neutral-300">{selectedReport.resource_type || "-"}</span></div>
                    <div>Status: <span className="text-neutral-300">{selectedReport.status}</span></div>
                    <div>Created: <span className="text-neutral-300">{fmtDate(selectedReport.created_at)}</span></div>
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3 text-sm space-y-1">
                    <div className="font-medium text-neutral-100">People</div>
                    <div>Reporter: <span className="text-neutral-300">{selectedReport.reporter?.email || selectedReport.reporter?.username || selectedReport.reporter_user_id}</span></div>
                    <div>Target: <span className="text-neutral-300">{selectedReport.targetUser?.email || selectedReport.targetUser?.username || selectedReport.target_user_id || "-"}</span></div>
                    <div>Warnings: <span className="text-neutral-300">{selectedReport.targetUser?.moderation?.warning_count ?? 0}</span></div>
                    <div>Ban: <span className="text-neutral-300">{selectedReport.targetUser?.moderation?.is_banned ? (selectedReport.targetUser?.moderation?.banned_until ? `Until ${fmtDate(selectedReport.targetUser.moderation.banned_until)}` : "Permanent") : "Not banned"}</span></div>
                  </div>
                </div>

                {selectedReport.details ? (
                  <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                    <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Reporter detail</div>
                    <div className="text-sm text-neutral-200 whitespace-pre-wrap">{selectedReport.details}</div>
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-xs text-neutral-400">Admin notes</label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={6}
                      className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                      placeholder="Internal notes for this report..."
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => updateReport("reviewed")}
                        disabled={busy !== null}
                        className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm"
                      >
                        Mark reviewed
                      </button>
                      <button
                        onClick={() => updateReport("resolved")}
                        disabled={busy !== null}
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-sm"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => updateReport("dismissed")}
                        disabled={busy !== null}
                        className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-60 text-sm"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs text-neutral-400">Reason shown in moderation history</label>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                      placeholder="Harassment in public comments"
                    />
                    <label className="block text-xs text-neutral-400">Internal action detail</label>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      rows={4}
                      className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
                      placeholder="What happened, what was removed, what warning was given..."
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={banDuration}
                        onChange={(e) => setBanDuration(e.target.value)}
                        className="rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
                      >
                        {BAN_DURATIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => takeAction("warn")}
                        disabled={busy !== null || !selectedReport.targetUser?.id}
                        className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-sm"
                      >
                        Warn
                      </button>
                      <button
                        onClick={() => takeAction("ban")}
                        disabled={busy !== null || !selectedReport.targetUser?.id}
                        className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 disabled:opacity-60 text-sm"
                      >
                        Ban
                      </button>
                      <button
                        onClick={() => takeAction("unban")}
                        disabled={busy !== null || !selectedReport.targetUser?.id}
                        className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-sm"
                      >
                        Unban
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

