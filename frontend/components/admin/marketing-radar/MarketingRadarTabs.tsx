"use client";

import React from "react";

export type MarketingRadarTab = "ingest" | "summary" | "drafts" | "publish";

const TABS: { id: MarketingRadarTab; step: number; label: string; hint: string }[] = [
  { id: "ingest", step: 1, label: "Ingest", hint: "Fetch & generate" },
  { id: "summary", step: 2, label: "Summary", hint: "Read the plan" },
  { id: "drafts", step: 3, label: "Drafts", hint: "Approve posts" },
  { id: "publish", step: 4, label: "Copy & post", hint: "Go live" },
];

type Props = {
  active: MarketingRadarTab;
  onChange: (tab: MarketingRadarTab) => void;
};

export function MarketingRadarTabs({ active, onChange }: Props) {
  return (
    <nav
      className="flex flex-wrap gap-1 rounded-xl border border-neutral-700 bg-neutral-900/60 p-1"
      aria-label="Marketing Radar workflow"
    >
      {TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 min-w-[7rem] rounded-lg px-3 py-2 text-left transition-colors ${
              selected
                ? "bg-emerald-900/50 border border-emerald-700/60 text-emerald-50"
                : "border border-transparent text-neutral-300 hover:bg-neutral-800/80"
            }`}
          >
            <div className="text-sm font-medium">
              <span className="text-emerald-500/80 mr-1">{tab.step}.</span>
              {tab.label}
            </div>
            <div className="text-[10px] text-neutral-500">{tab.hint}</div>
          </button>
        );
      })}
    </nav>
  );
}
