"use client";

import React from "react";

type Props = {
  title: string;
  url: string;
  text: string;
  busy: boolean;
  onTitle: (v: string) => void;
  onUrl: (v: string) => void;
  onText: (v: string) => void;
  onSubmit: () => void;
};

export function ManualSignalForm({
  title,
  url,
  text,
  busy,
  onTitle,
  onUrl,
  onText,
  onSubmit,
}: Props) {
  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
      <div>
        <div className="font-medium">Paste something by hand</div>
        <p className="text-sm text-neutral-500 mt-1">
          Reddit broken? Copy a hot thread title + text here. Works for Discord snippets, tweets, etc.
        </p>
      </div>
      <input
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm"
      />
      <input
        type="url"
        placeholder="Link (optional)"
        value={url}
        onChange={(e) => onUrl(e.target.value)}
        className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm"
      />
      <textarea
        placeholder="Paste the discussion text…"
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={5}
        className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm font-mono"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !text.trim()}
        className="px-4 py-2 rounded-lg border border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40 disabled:opacity-50 text-sm font-medium"
      >
        {busy ? "Saving…" : "Save to signals"}
      </button>
    </section>
  );
}
