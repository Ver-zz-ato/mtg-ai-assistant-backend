"use client";

import React from "react";

export type SignalFilterState = {
  source_type: string;
  topic: string;
  card: string;
  min_score: string;
};

type Props = {
  filters: SignalFilterState;
  onChange: (f: SignalFilterState) => void;
  onApply: () => void;
};

export function SignalFilters({ filters, onChange, onApply }: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-end">
      <label className="text-xs space-y-1">
        <span className="text-neutral-500">Source</span>
        <select
          value={filters.source_type}
          onChange={(e) => onChange({ ...filters, source_type: e.target.value })}
          className="block rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-sm"
        >
          <option value="">All</option>
          <option value="manual">manual</option>
          <option value="rss">rss</option>
          <option value="youtube_channel">youtube</option>
          <option value="reddit_subreddit">reddit</option>
        </select>
      </label>
      <label className="text-xs space-y-1">
        <span className="text-neutral-500">Topic</span>
        <input
          value={filters.topic}
          onChange={(e) => onChange({ ...filters, topic: e.target.value })}
          placeholder="commander"
          className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-sm w-28"
        />
      </label>
      <label className="text-xs space-y-1">
        <span className="text-neutral-500">Card</span>
        <input
          value={filters.card}
          onChange={(e) => onChange({ ...filters, card: e.target.value })}
          placeholder="Sol Ring"
          className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-sm w-28"
        />
      </label>
      <label className="text-xs space-y-1">
        <span className="text-neutral-500">Min score</span>
        <input
          type="number"
          value={filters.min_score}
          onChange={(e) => onChange({ ...filters, min_score: e.target.value })}
          className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-sm w-20"
        />
      </label>
      <button
        type="button"
        onClick={onApply}
        className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-800 text-sm hover:bg-neutral-700"
      >
        Apply filters
      </button>
    </div>
  );
}
