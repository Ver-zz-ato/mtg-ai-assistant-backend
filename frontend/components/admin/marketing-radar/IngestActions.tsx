"use client";

import React from "react";
import type { DailySummary, IngestSummary } from "./types";
import { formatIngestSummary } from "./types";

type Props = {
  youtubeConfigured: boolean;
  redditConfigured: boolean;
  onResult: (msg: string) => void;
  onDone: () => void;
};

export function IngestActions({ youtubeConfigured, redditConfigured, onResult, onDone }: Props) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [lastDaily, setLastDaily] = React.useState<DailySummary | null>(null);

  const post = async (path: string, label: string) => {
    setBusy(path);
    try {
      const res = await fetch(path, { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        onResult(json.message ?? json.error ?? `${label} failed`);
        return;
      }
      if (path.includes("daily-run")) {
        setLastDaily(json.summary as DailySummary);
        const s = json.summary as DailySummary;
        onResult(
          [
            formatIngestSummary("RSS", s.rss),
            formatIngestSummary("YouTube", s.youtube),
            formatIngestSummary("Reddit", s.reddit),
            s.brief?.created
              ? `Brief: created (${s.brief.draftCount ?? 0} drafts)`
              : `Brief: ${s.brief?.error ?? "not created"}`,
          ].join("\n")
        );
      } else {
        const r = json as IngestSummary;
        onResult(formatIngestSummary(label, r));
        if (r.errors?.length) {
          onResult(
            r.errors.map((e) => `${e.name}: ${e.error}`).join("\n")
          );
        }
      }
      onDone();
    } catch (e) {
      onResult(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "px-3 py-2 rounded-lg border text-sm disabled:opacity-50";

  return (
    <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-3">
      <div className="font-medium">Fetch signals</div>
      {!youtubeConfigured && (
        <p className="text-xs text-amber-300/90 rounded border border-amber-900/50 bg-amber-950/30 px-2 py-1.5">
          YOUTUBE_API_KEY is not set — YouTube fetch and daily run will skip video ingestion.
        </p>
      )}
      {!redditConfigured && (
        <p className="text-xs text-amber-300/90 rounded border border-amber-900/50 bg-amber-950/30 px-2 py-1.5">
          REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not set — Reddit fetch is skipped (use manual
          paste, or add a script app at reddit.com/prefs/apps).
        </p>
      )}
      <p className="text-xs text-neutral-500">
        Read-only ingestion for analysis. Nothing is posted automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          className={`${btn} border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40`}
          onClick={() => post("/api/admin/marketing-radar/ingest/rss", "RSS")}
        >
          {busy === "/api/admin/marketing-radar/ingest/rss" ? "Fetching…" : "Fetch MTG News"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className={`${btn} border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700`}
          onClick={() => post("/api/admin/marketing-radar/ingest/youtube", "YouTube")}
        >
          {busy === "/api/admin/marketing-radar/ingest/youtube" ? "Fetching…" : "Fetch YouTube Signals"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className={`${btn} border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700`}
          onClick={() => post("/api/admin/marketing-radar/ingest/reddit", "Reddit")}
        >
          {busy === "/api/admin/marketing-radar/ingest/reddit" ? "Fetching…" : "Fetch Reddit Signals"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          className={`${btn} border-purple-800 bg-purple-950/40 hover:bg-purple-900/30 text-purple-100`}
          onClick={() => post("/api/admin/marketing-radar/daily-run", "Daily")}
        >
          {busy === "/api/admin/marketing-radar/daily-run" ? "Running…" : "Run Full Daily Radar"}
        </button>
      </div>
      {lastDaily && (
        <pre className="text-xs text-neutral-400 whitespace-pre-wrap rounded border border-neutral-800 bg-black/30 p-2">
          {[
            formatIngestSummary("RSS", lastDaily.rss),
            formatIngestSummary("YouTube", lastDaily.youtube),
            formatIngestSummary("Reddit", lastDaily.reddit),
            lastDaily.brief?.created
              ? `Brief created: ${lastDaily.brief.draftCount} drafts`
              : `Brief: ${lastDaily.brief?.error ?? "skipped"}`,
          ].join("\n")}
        </pre>
      )}
    </section>
  );
}
