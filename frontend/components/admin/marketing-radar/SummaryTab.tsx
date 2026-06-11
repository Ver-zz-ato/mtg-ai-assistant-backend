"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";
import type { MarketingMetaSnapshot } from "@/lib/marketing/marketingBriefSchema";
import { BriefDetail } from "./BriefDetail";
import { BriefHistory } from "./BriefHistory";
import { SignalsList } from "./SignalsList";
import type { BriefHistoryItem } from "./types";
import type { MarketingBriefRow, MarketingSignalRow } from "@/lib/marketing/marketingBriefSchema";

function MetaPanel({ meta }: { meta: MarketingMetaSnapshot | null }) {
  if (!meta) return null;
  const chip = (items: string[]) =>
    items.length ? (
      <div className="flex flex-wrap gap-1">
        {items.map((n) => (
          <span key={n} className="text-xs px-2 py-0.5 rounded-full border border-neutral-600 bg-neutral-800/80">
            {n}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-xs text-neutral-500">—</span>
    );

  return (
    <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-3">
      <div>
        <div className="font-medium">ManaTap player meta (Discover)</div>
        <p className="text-sm text-neutral-500 mt-1">Blended into the AI brief alongside ingested signals.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <div className="text-neutral-400 text-xs mb-1">Trending cards</div>
          {chip(meta.trending_cards)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">Trending commanders</div>
          {chip(meta.trending_commanders)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">New set breakouts</div>
          {chip(meta.new_set_breakouts)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">Meta label</div>
          <p className="text-neutral-200 text-sm">{meta.meta_label ?? "—"}</p>
        </div>
      </div>
    </section>
  );
}

type Props = {
  brief: MarketingBriefRow | null;
  briefHistory: BriefHistoryItem[];
  selectedBriefId: string | null;
  signals: MarketingSignalRow[];
  meta: MarketingMetaSnapshot | null;
  onSelectBrief: (id: string) => void;
  onGoDrafts: () => void;
};

export function SummaryTab({
  brief,
  briefHistory,
  selectedBriefId,
  signals,
  meta,
  onSelectBrief,
  onGoDrafts,
}: Props) {
  const topSignals = [...signals].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);

  return (
    <div className="space-y-5">
      <ELI5
        heading="Step 2 — What people are talking about"
        items={[
          "This is the AI's read on trending MTG topics from your ingested signals.",
          "Pick a past brief from history if you want to review an older cycle.",
          "When ready, move to Drafts to approve one post per platform.",
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
          <div className="font-medium">Brief history</div>
          <BriefHistory
            items={briefHistory}
            selectedId={selectedBriefId}
            onSelect={onSelectBrief}
          />
        </section>
        <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
          <div className="flex justify-between items-center gap-2">
            <div className="font-medium">Brief summary</div>
            {brief && (
              <span className="text-xs text-neutral-500">
                {brief.brief_date} · {new Date(brief.created_at).toLocaleString()}
              </span>
            )}
          </div>
          <BriefDetail brief={brief} />
          {brief && (
            <button
              type="button"
              onClick={onGoDrafts}
              className="text-sm px-4 py-2 rounded-lg border border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40"
            >
              Review drafts →
            </button>
          )}
        </section>
      </div>

      <MetaPanel meta={meta} />

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
        <div className="font-medium">Top signals this week</div>
        <SignalsList signals={topSignals} />
      </section>
    </div>
  );
}
