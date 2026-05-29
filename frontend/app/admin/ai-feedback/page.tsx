"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAppFeaturePageLabel } from "@/lib/ai/app-feature-labels";

type FeedbackRow = {
  id: string;
  created_at: string;
  client: string;
  feature: string;
  route: string | null;
  surface_kind: string;
  rating: number | null;
  comment: string | null;
  issue_types: string[];
  user_id: string | null;
  context_jsonb: Record<string, unknown> | null;
  status: string;
  user_input_text?: string | null;
  ai_output_text?: string | null;
  admin_notes?: string | null;
};

type Groups = {
  byFeature: { feature: string; count: number }[];
  byRoute: { route: string; count: number }[];
};

const WINDOWS = [
  { id: "24h", label: "24 hours" },
  { id: "2d", label: "2 days" },
  { id: "7d", label: "7 days" },
  { id: "all", label: "All time" },
] as const;

export default function UnifiedAiFeedbackAdminPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<Groups | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowPreset, setWindowPreset] = useState<string>("7d");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FeedbackRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        window: windowPreset,
        groups: "1",
        limit: "80",
        offset: "0",
      });
      if (clientFilter !== "all") params.set("client", clientFilter);
      const r = await fetch(`/api/admin/ai-feedback?${params}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setRows([]);
        setTotal(0);
        setGroups(null);
        return;
      }
      setRows(j.events || []);
      setTotal(j.total ?? 0);
      setGroups(j.groups ?? null);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [windowPreset, clientFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/admin/ai-feedback/${id}`, { cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.ok) setDetail(j.event);
      else setDetail(null);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const copyExport = useCallback(async (mode: "item" | "all", id?: string) => {
    setExportBusy(true);
    try {
      const params = new URLSearchParams({ mode, window: windowPreset });
      if (clientFilter !== "all") params.set("client", clientFilter);
      if (mode === "item" && id) params.set("id", id);
      const r = await fetch(`/api/admin/ai-feedback/export?${params}`);
      const j = await r.json();
      if (!r.ok || !j.ok) return;
      const text = JSON.stringify(j.export, null, 2);
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    } finally {
      setExportBusy(false);
    }
  }, [windowPreset, clientFilter]);

  return (
    <div className="p-4 max-w-7xl mx-auto text-neutral-100">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <div>
          <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white mb-1 inline-block">
            ← Admin
          </Link>
          <h1 className="text-2xl font-bold">AI Feedback</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Unified feedback from app and web ({total} matching)
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={exportBusy}
            onClick={() => void copyExport("all")}
            className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm disabled:opacity-50"
          >
            {exportBusy ? "Exporting…" : "Copy all (JSON)"}
          </button>
          <Link href="/admin/ai-reports" className="text-sm text-amber-400 hover:underline px-2">
            Historical reports →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-sm text-neutral-400 self-center">Time:</span>
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setWindowPreset(w.id)}
            className={`px-3 py-1 rounded text-sm ${
              windowPreset === w.id ? "bg-amber-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {w.label}
          </button>
        ))}
        <span className="text-sm text-neutral-400 self-center ml-2">Client:</span>
        {["all", "app", "web"].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setClientFilter(c)}
            className={`px-3 py-1 rounded text-sm capitalize ${
              clientFilter === c ? "bg-amber-600 text-white" : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {groups ? (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <section className="rounded-lg border border-neutral-800 p-3">
            <h2 className="text-sm font-semibold text-neutral-300 mb-2">By feature</h2>
            <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {groups.byFeature.map(({ feature, count }) => (
                <li key={feature} className="flex justify-between gap-2">
                  <span>{getAppFeaturePageLabel(feature)}</span>
                  <span className="text-neutral-500 tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-lg border border-neutral-800 p-3">
            <h2 className="text-sm font-semibold text-neutral-300 mb-2">By route</h2>
            <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
              {groups.byRoute.map(({ route, count }) => (
                <li key={route} className="flex justify-between gap-2">
                  <span className="truncate font-mono">{route}</span>
                  <span className="text-neutral-500 tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      <div className="flex gap-4">
        <div className="flex-1 min-w-0 overflow-x-auto rounded border border-neutral-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-700 bg-neutral-900 text-left text-neutral-400">
                <th className="p-2">When</th>
                <th className="p-2">Client</th>
                <th className="p-2">Feature</th>
                <th className="p-2">Rating</th>
                <th className="p-2">Comment</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-neutral-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-neutral-500">
                    No feedback in this window
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-neutral-800/80 hover:bg-neutral-900/60 cursor-pointer align-top ${
                      selectedId === r.id ? "bg-neutral-900/80" : ""
                    }`}
                    onClick={() => void openDetail(r.id)}
                  >
                    <td className="p-2 whitespace-nowrap text-neutral-400 text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 text-xs">{r.client}</td>
                    <td className="p-2 text-xs">
                      <div>{getAppFeaturePageLabel(r.feature)}</div>
                      <div className="text-neutral-500 font-mono text-[10px]">{r.feature}</div>
                    </td>
                    <td className="p-2">
                      {r.rating === 1 ? "👍" : r.rating === -1 ? "👎" : r.rating ?? "—"}
                    </td>
                    <td className="p-2 max-w-xs">
                      <span className="line-clamp-2 text-neutral-300">{r.comment || "—"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedId ? (
          <aside className="w-full max-w-md shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-3">
              <h2 className="font-semibold">Detail</h2>
              <button
                type="button"
                className="text-neutral-400 hover:text-white text-sm"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                }}
              >
                Close
              </button>
            </div>
            {detailLoading || !detail ? (
              <p className="text-neutral-500 text-sm">Loading…</p>
            ) : (
              <div className="space-y-3 text-sm">
                <Meta label="ID" value={detail.id} mono />
                <Meta label="Feature" value={getAppFeaturePageLabel(detail.feature)} />
                <Meta label="Route" value={detail.route ?? "—"} mono />
                <Meta label="Surface" value={detail.surface_kind} />
                <Meta label="Rating" value={String(detail.rating ?? "—")} />
                {detail.comment ? (
                  <div>
                    <div className="text-neutral-500 text-xs mb-1">Comment</div>
                    <p className="whitespace-pre-wrap text-neutral-200">{detail.comment}</p>
                  </div>
                ) : null}
                {detail.issue_types?.length ? (
                  <Meta label="Issues" value={detail.issue_types.join(", ")} />
                ) : null}
                {detail.user_input_text ? (
                  <Block label="User input" text={detail.user_input_text} />
                ) : null}
                {detail.ai_output_text ? (
                  <Block label="AI output" text={detail.ai_output_text} />
                ) : null}
                {detail.context_jsonb && Object.keys(detail.context_jsonb).length > 0 ? (
                  <div>
                    <div className="text-neutral-500 text-xs mb-1">Context</div>
                    <pre className="text-[10px] bg-neutral-900 p-2 rounded overflow-x-auto">
                      {JSON.stringify(detail.context_jsonb, null, 2)}
                    </pre>
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={() => void copyExport("item", detail.id)}
                  className="w-full mt-2 px-3 py-2 rounded bg-amber-700 hover:bg-amber-600 text-sm disabled:opacity-50"
                >
                  Copy as JSON for Cursor
                </button>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      <p className="text-xs text-neutral-600 mt-6">
        Legacy <code className="text-neutral-500">ai_response_reports</code> are read-only — use{" "}
        <Link href="/admin/ai-reports" className="text-amber-500 hover:underline">
          AI reports
        </Link>{" "}
        for older triage. The previous{" "}
        <Link href="/admin/app-ai-feedback" className="text-amber-500 hover:underline">
          app-only view
        </Link>{" "}
        is superseded by this page.
      </p>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-neutral-500 text-xs">{label}</div>
      <div className={mono ? "font-mono text-xs break-all" : ""}>{value}</div>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-neutral-500 text-xs mb-1">{label}</div>
      <p className="whitespace-pre-wrap text-neutral-300 text-xs max-h-48 overflow-y-auto">{text}</p>
    </div>
  );
}
