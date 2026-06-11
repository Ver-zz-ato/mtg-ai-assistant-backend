"use client";

import type { MarketingSignalRow } from "@/lib/marketing/marketingBriefSchema";

export function SignalsList({ signals }: { signals: MarketingSignalRow[] }) {
  if (!signals.length) {
    return <p className="text-sm text-neutral-500">No signals match filters.</p>;
  }
  return (
    <ul className="space-y-2 max-h-96 overflow-y-auto">
      {signals.map((s) => (
        <li
          key={s.id}
          className="rounded border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium text-neutral-200">{s.title ?? "(untitled)"}</span>
            <span className="text-xs text-neutral-500">
              {s.source_type} · score {s.score} · {new Date(s.created_at).toLocaleString()}
            </span>
          </div>
          {s.url && (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 break-all"
            >
              {s.url}
            </a>
          )}
          <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{s.raw_text?.slice(0, 200)}</p>
        </li>
      ))}
    </ul>
  );
}
