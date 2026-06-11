"use client";

import React from "react";
import type { DailySummary, IngestSummary } from "./types";
import { formatIngestSummary } from "./types";

type Props = {
  youtubeConfigured: boolean;
  redditConfigured: boolean;
  onResult: (msg: string) => void;
  onDone: () => void;
  compact?: boolean;
};

export function IngestActions({
  youtubeConfigured,
  redditConfigured,
  onResult,
  onDone,
  compact,
}: Props) {
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
        const lines = [
          formatIngestSummary("Articles", s.rss),
          formatIngestSummary("YouTube", s.youtube),
          formatIngestSummary("Reddit", s.reddit),
          s.brief?.created
            ? `Brief: created (${s.brief.draftCount ?? 0} drafts)`
            : `Brief: ${s.brief?.error ?? "not created"}`,
        ];
        onResult(lines.join("\n"));
      } else {
        const r = json as IngestSummary;
        const lines = [formatIngestSummary(label, r)];
        if (r.errors?.length) {
          lines.push(r.errors.map((e) => `  • ${e.name}: ${e.error}`).join("\n"));
        }
        onResult(lines.join("\n"));
      }
      onDone();
    } catch (e) {
      onResult(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const btn =
    "px-3 py-2.5 rounded-lg border text-sm disabled:opacity-50 text-left";

  const actions = [
    {
      path: "/api/admin/marketing-radar/ingest/rss",
      label: "Articles",
      title: "Pull MTG articles",
      desc: "EDHREC, MTGGoldfish, Commanders Herald",
      className: "border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40",
    },
    {
      path: "/api/admin/marketing-radar/ingest/youtube",
      label: "YouTube",
      title: "Pull YouTube videos",
      desc: youtubeConfigured ? "Command Zone, Tolarian, etc." : "Needs YOUTUBE_API_KEY",
      className: "border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700",
      disabled: !youtubeConfigured,
    },
    {
      path: "/api/admin/marketing-radar/ingest/reddit",
      label: "Reddit",
      title: "Pull Reddit hot posts",
      desc: redditConfigured ? "r/EDH, r/magicTCG, …" : "Needs Reddit script app — Setup tab",
      className: "border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700",
      disabled: !redditConfigured,
    },
  ];

  return (
    <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-3">
      {!compact && (
        <div>
          <div className="font-medium">Fetch from the web</div>
          <p className="text-sm text-neutral-500 mt-1">
            Read-only. We save titles and text for the AI — nothing gets posted anywhere.
          </p>
        </div>
      )}
      {!redditConfigured && (
        <p className="text-xs text-amber-300/90 rounded border border-amber-900/50 bg-amber-950/30 px-2 py-1.5">
          Reddit not wired yet — use <strong>Setup</strong> tab or paste threads manually below.
        </p>
      )}
      <div className={`grid gap-2 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {actions.map((a) => (
          <button
            key={a.path}
            type="button"
            disabled={!!busy || a.disabled}
            className={`${btn} ${a.className}`}
            onClick={() => post(a.path, a.label)}
          >
            <div className="font-medium">
              {busy === a.path ? "Fetching…" : a.title}
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">{a.desc}</div>
          </button>
        ))}
      </div>
      {!compact && (
        <button
          type="button"
          disabled={!!busy}
          className="w-full px-3 py-2.5 rounded-lg border border-purple-800 bg-purple-950/40 hover:bg-purple-900/30 text-purple-100 text-sm font-medium disabled:opacity-50"
          onClick={() => post("/api/admin/marketing-radar/daily-run", "Daily")}
        >
          {busy === "/api/admin/marketing-radar/daily-run" ? "Running…" : "Run all fetches + AI brief"}
        </button>
      )}
      {lastDaily && !compact && (
        <pre className="text-xs text-neutral-400 whitespace-pre-wrap rounded border border-neutral-800 bg-black/30 p-2">
          {[
            formatIngestSummary("Articles", lastDaily.rss),
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
