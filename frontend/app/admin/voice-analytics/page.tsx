"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type VoiceRow = {
  id: string;
  created_at: string;
  user_tier: string | null;
  screen: string | null;
  transcript: string | null;
  detected_mode: string | null;
  match_quality: string | null;
  clarify_reason: string | null;
  final_outcome: string | null;
  latency_ms: number | null;
};

const WINDOWS = [
  { id: "24h", label: "24 hours" },
  { id: "2d", label: "2 days" },
  { id: "7d", label: "7 days" },
  { id: "all", label: "All time" },
] as const;

export default function VoiceAnalyticsPage() {
  const [rows, setRows] = useState<VoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowPreset, setWindowPreset] = useState("7d");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ window: windowPreset, limit: "80", offset: "0" });
      const res = await fetch(`/api/admin/voice-analytics?${params}`, { cache: "no-store" });
      const json = await res.json();
      setRows(res.ok && json.ok ? json.rows ?? [] : []);
    } finally {
      setLoading(false);
    }
  }, [windowPreset]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    const res = await fetch(`/api/admin/voice-analytics/${id}`, { cache: "no-store" });
    const json = await res.json();
    setDetail(res.ok && json.ok ? json.event : null);
  }, []);

  const copyExport = useCallback(async () => {
    const params = new URLSearchParams({ window: windowPreset, limit: "500" });
    const res = await fetch(`/api/admin/voice-analytics/export?${params}`);
    const json = await res.json();
    if (res.ok && json.ok) {
      await navigator.clipboard.writeText(JSON.stringify(json.export, null, 2));
    }
  }, [windowPreset]);

  return (
    <div className="p-4 max-w-7xl mx-auto text-neutral-100">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <Link href="/admin/mobile-command-center" className="text-sm text-neutral-400 hover:text-white mb-1 inline-block">
            ← Mobile command center
          </Link>
          <h1 className="text-2xl font-bold">Voice Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">Hidden interaction telemetry for app voice command quality.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm">
            Refresh
          </button>
          <button type="button" onClick={() => void copyExport()} className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm">
            Copy all (JSON)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-sm text-neutral-400 self-center">Time:</span>
        {WINDOWS.map((window) => (
          <button
            key={window.id}
            type="button"
            onClick={() => setWindowPreset(window.id)}
            className={`px-3 py-1 rounded text-sm ${
              windowPreset === window.id ? "bg-amber-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {window.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0 overflow-x-auto rounded border border-neutral-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-900 text-left text-neutral-400">
                <th className="p-2">When</th>
                <th className="p-2">Tier</th>
                <th className="p-2">Mode</th>
                <th className="p-2">Match</th>
                <th className="p-2">Outcome</th>
                <th className="p-2">Transcript</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-neutral-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-neutral-500">No voice interactions in this window</td></tr>
              ) : rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-neutral-800/80 hover:bg-neutral-900/60 cursor-pointer ${selectedId === row.id ? "bg-neutral-900/80" : ""}`}
                  onClick={() => void openDetail(row.id)}
                >
                  <td className="p-2 whitespace-nowrap text-neutral-400 text-xs">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="p-2 text-xs">{row.user_tier ?? "-"}</td>
                  <td className="p-2 text-xs">{row.detected_mode ?? "-"}</td>
                  <td className="p-2 text-xs">{row.match_quality ?? "-"}</td>
                  <td className="p-2 text-xs">{row.final_outcome ?? "-"}</td>
                  <td className="p-2 text-xs max-w-md"><span className="line-clamp-2">{row.transcript || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedId ? (
          <aside className="w-full max-w-md shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-4 max-h-[80vh] overflow-y-auto">
            <h2 className="text-sm font-semibold mb-3">Interaction detail</h2>
            <pre className="text-xs whitespace-pre-wrap break-words text-neutral-300">
              {detail ? JSON.stringify(detail, null, 2) : "Loading…"}
            </pre>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
