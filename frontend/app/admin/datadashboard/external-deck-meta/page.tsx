"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";

type StatusData = {
  sources: Array<{
    source_key: string;
    display_name: string;
    enabled: boolean;
    discovery_enabled: boolean;
    cooldown_until: string | null;
    last_success_at: string | null;
    last_error: string | null;
    consecutive_failures: number;
  }>;
  queue_total: number;
  queue_by_status: Record<string, number>;
  decks_total: number;
  decks_by_state: Record<string, number>;
  profiles: Array<{
    id: string;
    commander_name: string;
    raw_sample_size: number;
    approved_sample_size: number;
    excluded_count: number;
    exclusion_reasons: Record<string, number>;
    source_breakdown: Record<string, number>;
    confidence_score: number;
    approved_for_public: boolean;
    attribution?: { copy?: string };
    last_refreshed_at: string;
  }>;
};

export default function ExternalDeckMetaPage() {
  const [data, setData] = React.useState<StatusData | null>(null);
  const [urls, setUrls] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    // eslint-disable-next-line no-restricted-globals -- Client admin page calls same-origin admin API.
    const res = await fetch("/api/admin/data/external-deck-meta/status", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load status");
    setData(json.data);
  }

  React.useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, []);

  async function postJson(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // eslint-disable-next-line no-restricted-globals -- Client admin page calls same-origin admin API.
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
      setMessage(JSON.stringify(json.result ?? json.summary ?? json.profile ?? json, null, 2));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const urlList = urls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">External Deck Meta</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Admin-only QA for public Moxfield/Archidekt deck ingestion. Nothing here powers public or mobile output yet.
        </p>
      </div>
      <DataDashboardNav />

      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <h2 className="font-medium">Queue public deck URLs</h2>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={5}
          placeholder="https://archidekt.com/decks/123456&#10;https://moxfield.com/decks/abc123"
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || urlList.length === 0}
            onClick={() => postJson("/api/admin/data/external-deck-meta/queue", { urls: urlList })}
            className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-sm"
          >
            Queue URLs
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => postJson("/api/admin/data/external-deck-meta/run", { source: "all", limit: 10, discover: true })}
            className="px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-sm"
          >
            Run ingest now
          </button>
        </div>
      </section>

      {error && <pre className="text-sm text-red-300 whitespace-pre-wrap">{error}</pre>}
      {message && <pre className="text-xs text-emerald-300 bg-neutral-950 border border-neutral-800 rounded p-3 overflow-auto">{message}</pre>}

      {data && (
        <>
          <section className="rounded border border-neutral-800 p-4">
            <h2 className="font-medium mb-3">Source health</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.sources.map((s) => (
                <div key={s.source_key} className="rounded bg-neutral-900 border border-neutral-800 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{s.display_name}</span>
                    <span className={s.enabled ? "text-emerald-300" : "text-red-300"}>{s.enabled ? "enabled" : "disabled"}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-2 space-y-1">
                    <div>Discovery: {s.discovery_enabled ? "on" : "off"}</div>
                    <div>Cooldown: {s.cooldown_until ?? "none"}</div>
                    <div>Last success: {s.last_success_at ?? "never"}</div>
                    <div>Failures: {s.consecutive_failures}</div>
                    {s.last_error && <div className="text-amber-300">Last error: {s.last_error}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded border border-neutral-800 p-4 text-sm">
            <h2 className="font-medium mb-3">Counts</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>Queue total: <span className="font-mono">{data.queue_total}</span></div>
              <div>Decks total: <span className="font-mono">{data.decks_total}</span></div>
            </div>
            <pre className="mt-3 text-xs text-neutral-400 bg-neutral-950 rounded p-3 overflow-auto">
              {JSON.stringify({ queue_by_status: data.queue_by_status, decks_by_state: data.decks_by_state }, null, 2)}
            </pre>
          </section>

          <section className="rounded border border-neutral-800 p-4">
            <h2 className="font-medium mb-3">Commander profiles QA</h2>
            <div className="space-y-3">
              {data.profiles.length === 0 && <div className="text-sm text-neutral-500">No profiles yet.</div>}
              {data.profiles.map((p) => (
                <div key={p.id} className="rounded bg-neutral-900 border border-neutral-800 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{p.commander_name}</div>
                      <div className="text-xs text-neutral-500">{p.attribution?.copy ?? "No attribution copy yet."}</div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => postJson(`/api/admin/data/external-deck-meta/profiles/${p.id}/approval`, { approved: !p.approved_for_public })}
                      className={`px-3 py-1.5 rounded text-xs ${p.approved_for_public ? "bg-red-800 hover:bg-red-700" : "bg-emerald-800 hover:bg-emerald-700"}`}
                    >
                      {p.approved_for_public ? "Unapprove" : "Approve QA"}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4 text-xs text-neutral-400 mt-3">
                    <div>Raw: {p.raw_sample_size}</div>
                    <div>Approved sample: {p.approved_sample_size}</div>
                    <div>Excluded: {p.excluded_count}</div>
                    <div>Confidence: {p.confidence_score}</div>
                  </div>
                  <pre className="mt-2 text-xs text-neutral-500 bg-neutral-950 rounded p-2 overflow-auto">
                    {JSON.stringify({ sources: p.source_breakdown, exclusions: p.exclusion_reasons }, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
