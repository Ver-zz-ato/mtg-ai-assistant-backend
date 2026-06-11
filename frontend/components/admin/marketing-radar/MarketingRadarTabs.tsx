"use client";

import React from "react";

export type MarketingRadarTab = "workflow" | "collect" | "drafts" | "publish" | "setup";

const TABS: { id: MarketingRadarTab; label: string; hint: string }[] = [
  { id: "workflow", label: "Start here", hint: "Daily flow" },
  { id: "collect", label: "Collect topics", hint: "News & Reddit" },
  { id: "drafts", label: "AI drafts", hint: "Brief & posts" },
  { id: "publish", label: "Post & schedule", hint: "Copy & calendar" },
  { id: "setup", label: "Setup", hint: "Sources & Reddit" },
];

type Props = {
  active: MarketingRadarTab;
  onChange: (tab: MarketingRadarTab) => void;
};

export function MarketingRadarTabs({ active, onChange }: Props) {
  return (
    <nav
      className="flex flex-wrap gap-1 rounded-xl border border-neutral-700 bg-neutral-900/60 p-1"
      aria-label="Marketing Radar sections"
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
            <div className="text-sm font-medium">{tab.label}</div>
            <div className="text-[10px] text-neutral-500">{tab.hint}</div>
          </button>
        );
      })}
    </nav>
  );
}
