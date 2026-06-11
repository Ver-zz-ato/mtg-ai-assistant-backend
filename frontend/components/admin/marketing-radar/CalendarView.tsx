"use client";

import type { MarketingDraftRow } from "@/lib/marketing/marketingBriefSchema";
import { PLATFORM_LABELS, statusBadgeClass } from "./types";

export function CalendarView({ drafts }: { drafts: MarketingDraftRow[] }) {
  const scheduled = drafts.filter((d) => d.scheduled_for && !d.superseded_at);
  if (!scheduled.length) {
    return (
      <p className="text-sm text-neutral-500">
        No drafts with a planned date. Set scheduled_for on a draft to see it here.
      </p>
    );
  }

  const byDate = new Map<string, MarketingDraftRow[]>();
  for (const d of scheduled) {
    const key = d.scheduled_for!.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(d);
  }

  const dates = [...byDate.keys()].sort();

  return (
    <div className="space-y-4">
      {dates.map((date) => (
        <div key={date}>
          <div className="text-sm font-medium text-emerald-300/80 mb-2">{date}</div>
          <ul className="space-y-2">
            {(byDate.get(date) ?? []).map((d) => (
              <li
                key={d.id}
                className="rounded border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"
              >
                <div className="flex justify-between gap-2 flex-wrap mb-1">
                  <span>{PLATFORM_LABELS[d.platform] ?? d.platform}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(d.status)}`}>
                    {d.status}
                  </span>
                </div>
                {d.campaign && (
                  <div className="text-xs text-neutral-500 mb-1">Campaign: {d.campaign}</div>
                )}
                <p className="text-xs text-neutral-400 line-clamp-3">{d.content}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
