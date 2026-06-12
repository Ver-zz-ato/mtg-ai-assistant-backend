"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";
import { IngestActions } from "./IngestActions";
import { SetupTab, type MarketingSourceHealthRow } from "./SetupTab";

type Props = {
  sources: MarketingSourceHealthRow[];
  youtubeOk: boolean;
  redditOk: boolean;
  redditPartial: boolean;
  runBusy: boolean;
  onRunDaily: () => void;
  onIngestDone: () => void;
  onResult: (msg: string) => void;
};

function sourceHealthSummary(sources: MarketingSourceHealthRow[]): {
  healthy: number;
  errors: number;
  disabled: number;
} {
  let healthy = 0;
  let errors = 0;
  let disabled = 0;
  for (const s of sources) {
    if (!s.enabled) disabled += 1;
    else if (s.fetch_error) errors += 1;
    else healthy += 1;
  }
  return { healthy, errors, disabled };
}

export function IngestTab({
  sources,
  youtubeOk,
  redditOk,
  redditPartial,
  runBusy,
  onRunDaily,
  onIngestDone,
  onResult,
}: Props) {
  const [showSetup, setShowSetup] = React.useState(false);
  const health = sourceHealthSummary(sources);

  return (
    <div className="space-y-5">
      <ELI5
        heading="Step 1 — Fetch topics and write drafts"
        items={[
          "This step reads the internet (RSS, YouTube, Reddit) for what Commander players are discussing.",
          "Run everything = fetch + AI writes one X post, one Instagram caption, and one blog article.",
          "Nothing goes public automatically. You always review in step 3 before copying or publishing.",
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-4 py-3">
          <div className="text-xs text-neutral-500">Healthy sources</div>
          <div className="text-2xl font-semibold text-emerald-200">{health.healthy}</div>
        </div>
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3">
          <div className="text-xs text-neutral-500">Source errors</div>
          <div className="text-2xl font-semibold text-amber-200">{health.errors}</div>
        </div>
        <div className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-4 py-3">
          <div className="text-xs text-neutral-500">Disabled</div>
          <div className="text-2xl font-semibold text-neutral-300">{health.disabled}</div>
        </div>
      </div>

      <section className="rounded-xl border border-purple-900/50 bg-purple-950/25 p-4 space-y-3">
        <div>
          <div className="font-medium text-purple-100">Run everything</div>
          <p className="text-sm text-neutral-400 mt-1">
            Ingests RSS{redditOk ? ", Reddit" : ""}{youtubeOk ? ", YouTube" : ""}, writes today&apos;s
            brief, and creates one draft each for X, Instagram, and blog.
          </p>
        </div>
        <button
          type="button"
          disabled={runBusy}
          onClick={onRunDaily}
          className="w-full sm:w-auto px-5 py-3 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-medium text-sm"
        >
          {runBusy ? "Running ingestion + AI…" : "Run everything"}
        </button>
        {!redditOk && (
          <p className="text-xs text-amber-300/90">
            Reddit skipped until credentials are set — expand Setup below.
          </p>
        )}
      </section>

      <IngestActions
        youtubeConfigured={youtubeOk}
        redditConfigured={redditOk}
        onResult={onResult}
        onDone={onIngestDone}
      />

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40">
        <button
          type="button"
          onClick={() => setShowSetup((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-neutral-800/50 rounded-xl"
        >
          <span>Source health &amp; Reddit setup</span>
          <span className="text-neutral-500">{showSetup ? "▲" : "▼"}</span>
        </button>
        {showSetup && (
          <div className="px-4 pb-4 border-t border-neutral-800">
            <SetupTab
              sources={sources}
              youtubeConfigured={youtubeOk}
              redditConfigured={redditOk}
              redditPartial={redditPartial}
            />
          </div>
        )}
      </section>
    </div>
  );
}
