"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";
import type { MarketingRadarTab } from "./MarketingRadarTabs";

type Props = {
  signalCount: number;
  draftCount: number;
  pendingDraftCount: number;
  briefDate: string | null;
  runBusy: boolean;
  onRunDaily: () => void;
  onRunBrief: () => void;
  onGoTab: (tab: MarketingRadarTab) => void;
  youtubeOk: boolean;
  redditOk: boolean;
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-950/50 px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-2xl font-semibold text-neutral-100 mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-neutral-500 mt-1">{sub}</div>}
    </div>
  );
}

export function WorkflowTab({
  signalCount,
  draftCount,
  pendingDraftCount,
  briefDate,
  runBusy,
  onRunDaily,
  onRunBrief,
  onGoTab,
  youtubeOk,
  redditOk,
}: Props) {
  const steps = [
    {
      n: 1,
      title: "Collect what's buzzing",
      body: "Pull articles, videos, and Reddit threads. Or paste anything interesting by hand.",
      action: "Go to Collect topics",
      tab: "collect" as const,
    },
    {
      n: 2,
      title: "Let AI write a brief + drafts",
      body: "Blends your signals with Discover meta trends. You get X, Instagram, blog, and Reddit drafts.",
      action: "Run AI brief now",
      onClick: onRunBrief,
    },
    {
      n: 3,
      title: "You approve, copy, and post",
      body: "Nothing auto-posts. Copy text into each platform yourself, then mark copied / schedule.",
      action: "Go to Post & schedule",
      tab: "publish" as const,
    },
  ];

  return (
    <div className="space-y-5">
      <ELI5
        heading="What is Marketing Radar?"
        items={[
          "Like a research assistant for MTG social — it reads the internet, spots trends, and drafts posts for you.",
          "It never posts for you. You always review, edit, copy, and publish manually.",
          "Run once a day (or use the big button below) and spend ~10 minutes approving what you like.",
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Signals saved" value={signalCount} sub="Last 7 days, scored" />
        <StatCard label="Drafts in brief" value={draftCount} sub={briefDate ? `Brief: ${briefDate}` : "No brief yet"} />
        <StatCard label="Needs review" value={pendingDraftCount} sub="Status: draft" />
      </div>

      <section className="rounded-xl border border-purple-900/50 bg-purple-950/25 p-4 space-y-3">
        <div>
          <div className="font-medium text-purple-100">One-click daily run</div>
          <p className="text-sm text-neutral-400 mt-1">
            Fetches news{redditOk ? ", Reddit" : ""}{youtubeOk ? ", YouTube" : ""}, then writes today&apos;s brief and drafts.
          </p>
        </div>
        <button
          type="button"
          disabled={runBusy}
          onClick={onRunDaily}
          className="w-full sm:w-auto px-5 py-3 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-medium text-sm"
        >
          {runBusy ? "Running full radar…" : "Run everything (recommended)"}
        </button>
        {!redditOk && (
          <p className="text-xs text-amber-300/90">
            Reddit skipped until credentials are set — see Setup tab. Manual paste still works.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-300">Step-by-step (if you prefer manual control)</h2>
        {steps.map((step) => (
          <div
            key={step.n}
            className="flex gap-4 rounded-xl border border-neutral-700 bg-neutral-900/40 p-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-900/60 text-emerald-200 text-sm font-semibold">
              {step.n}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="font-medium">{step.title}</div>
              <p className="text-sm text-neutral-400">{step.body}</p>
              {step.onClick ? (
                <button
                  type="button"
                  disabled={runBusy}
                  onClick={step.onClick}
                  className="text-sm px-3 py-1.5 rounded-lg border border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40 disabled:opacity-50"
                >
                  {step.action}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => step.tab && onGoTab(step.tab)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-neutral-600 bg-neutral-800 hover:bg-neutral-700"
                >
                  {step.action}
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
