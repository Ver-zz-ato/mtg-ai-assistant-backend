"use client";
import { useState, useEffect, useCallback } from "react";

type Report = {
  id: string;
  created_at: string;
  user_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  issue_types: string[];
  description: string | null;
  ai_response_text: string | null;
  user_message_text: string | null;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-600",
  reviewed: "bg-blue-600",
  resolved: "bg-green-600",
  dismissed: "bg-neutral-600",
};

const ISSUE_LABELS: Record<string, string> = {
  invented_card: "Invented Card",
  wrong_format: "Wrong Format",
  bad_recommendation: "Bad Recommendation",
  incorrect_data: "Incorrect Data",
  other: "Other",
};

export default function AIReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [correctedResponse, setCorrectedResponse] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-reports?status=${statusFilter}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error("Failed to fetch reports:", e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  function selectReport(report: Report) {
    setSelectedReport(report);
    setAdminNotes(report.admin_notes || "");
    setCorrectedResponse("");
  }

  async function updateReportStatus(status: string) {
    if (!selectedReport) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ai-reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId: selectedReport.id,
          status,
          adminNotes: adminNotes || null,
          correctedResponse: correctedResponse.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }

      setSelectedReport(null);
      fetchReports();
    } catch (e: any) {
      alert("Failed to update: " + (e?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">AI Response Reports</h1>

      <div className="flex gap-2 mb-4">
        {["pending", "reviewed", "resolved", "dismissed", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded capitalize ${
              statusFilter === s
                ? "bg-amber-600 text-white"
                : "bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-neutral-400">Loading...</div>
      ) : reports.length === 0 ? (
        <div className="text-neutral-400">No reports found.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Report List */}
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {reports.map((r) => (
              <div
                key={r.id}
                onClick={() => selectReport(r)}
                className={`p-3 rounded border cursor-pointer transition-colors ${
                  selectedReport?.id === r.id
                    ? "border-amber-500 bg-neutral-800"
                    : "border-neutral-700 bg-neutral-900 hover:bg-neutral-800"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-1 flex-wrap">
                    {r.issue_types.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-0.5 rounded bg-neutral-700"
                      >
                        {ISSUE_LABELS[t] || t}
                      </span>
                    ))}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded text-white ${
                      STATUS_COLORS[r.status] || "bg-neutral-600"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="text-sm text-neutral-400 truncate">
                  {r.ai_response_text?.slice(0, 100)}...
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Report Detail */}
          {selectedReport && (
            <div className="p-4 rounded border border-neutral-700 bg-neutral-900 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Report Details</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">
                    Issue Types
                  </label>
                  <div className="flex gap-1 flex-wrap">
                    {selectedReport.issue_types.map((t) => (
                      <span
                        key={t}
                        className="text-sm px-2 py-1 rounded bg-amber-600/20 text-amber-400"
                      >
                        {ISSUE_LABELS[t] || t}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedReport.description && (
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">
                      User Description
                    </label>
                    <div className="p-2 rounded bg-neutral-800 text-sm">
                      {selectedReport.description}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-neutral-400 block mb-1">
                    User Message
                  </label>
                  <div className="p-2 rounded bg-neutral-800 text-sm max-h-32 overflow-y-auto">
                    {selectedReport.user_message_text || "(not available)"}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-neutral-400 block mb-1">
                    AI Response (Reported)
                  </label>
                  <div className="p-2 rounded bg-neutral-800 text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {selectedReport.ai_response_text || "(not available)"}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-neutral-400 block mb-1">
                    Corrected Response (for training)
                  </label>
                  <textarea
                    value={correctedResponse}
                    onChange={(e) => setCorrectedResponse(e.target.value)}
                    rows={6}
                    className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
                    placeholder="Write the corrected response that should have been given..."
                  />
                </div>

                <div>
                  <label className="text-xs text-neutral-400 block mb-1">
                    Admin Notes
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
                    placeholder="Internal notes..."
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => updateReportStatus("resolved")}
                    disabled={saving}
                    className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-500 disabled:opacity-50"
                  >
                    Mark Resolved
                  </button>
                  <button
                    onClick={() => updateReportStatus("reviewed")}
                    disabled={saving}
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    Mark Reviewed
                  </button>
                  <button
                    onClick={() => updateReportStatus("dismissed")}
                    disabled={saving}
                    className="px-4 py-2 rounded bg-neutral-600 text-white hover:bg-neutral-500 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
