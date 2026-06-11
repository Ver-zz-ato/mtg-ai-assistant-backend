"use client";

import { stringifyBriefItem, type MarketingBriefRow } from "@/lib/marketing/marketingBriefSchema";

function ChipList({ items, empty }: { items: unknown[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-neutral-500">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span
          key={`${stringifyBriefItem(item)}-${i}`}
          className="text-xs px-2 py-1 rounded-full border border-neutral-600 bg-neutral-800/80 text-neutral-200"
        >
          {stringifyBriefItem(item)}
        </span>
      ))}
    </div>
  );
}

export function BriefDetail({ brief }: { brief: MarketingBriefRow | null }) {
  if (!brief) {
    return <p className="text-sm text-neutral-500">Select a brief or run a new one.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">{brief.summary}</p>
      <div>
        <div className="text-xs text-neutral-400 mb-1">Trending cards</div>
        <ChipList items={Array.isArray(brief.trending_cards) ? brief.trending_cards : []} empty="None" />
      </div>
      <div>
        <div className="text-xs text-neutral-400 mb-1">Trending topics</div>
        <ChipList items={Array.isArray(brief.trending_topics) ? brief.trending_topics : []} empty="None" />
      </div>
      <div>
        <div className="text-xs text-neutral-400 mb-1">Opportunities</div>
        {Array.isArray(brief.opportunities) && brief.opportunities.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {brief.opportunities.map((opp, i) => (
              <li key={i} className="rounded border border-neutral-700 px-2 py-1">
                {stringifyBriefItem(opp)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">None</p>
        )}
      </div>
    </div>
  );
}
