"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";
import {
  MARKETING_PLATFORMS,
  type MarketingDraftRow,
} from "@/lib/marketing/marketingBriefSchema";
import { copyText, PLATFORM_LABELS, statusBadgeClass } from "./types";

type Props = {
  drafts: MarketingDraftRow[];
  draftEdits: Record<string, string>;
  publishBusyId: string | null;
  draftBusyId: string | null;
  onPublishBlog: (id: string) => Promise<void>;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onCopied?: () => void;
};

export function PublishTab({
  drafts,
  draftEdits,
  publishBusyId,
  draftBusyId,
  onPublishBlog,
  onPatch,
  onCopied,
}: Props) {
  const approved = MARKETING_PLATFORMS.map((platform) =>
    drafts.find((d) => d.platform === platform && d.status === "approved")
  ).filter((d): d is MarketingDraftRow => !!d);

  const posted = MARKETING_PLATFORMS.map((platform) =>
    drafts.find((d) => d.platform === platform && d.status === "posted")
  ).filter((d): d is MarketingDraftRow => !!d);

  const handleCopy = async (draft: MarketingDraftRow) => {
    await copyText(draftEdits[draft.id] ?? draft.content);
    await onPatch(draft.id, { mark_copied: true });
    onCopied?.();
  };

  return (
    <div className="space-y-5">
      <ELI5
        heading="Step 4 — Copy and post"
        items={[
          "X and Instagram: copy the text, paste into each app yourself (no API fees).",
          "Blog: copy or use Publish to blog to push live on manatap.ai (~weekly is fine).",
          "Optional: paste the live post URL and Mark posted to keep a record.",
        ]}
      />

      {approved.length === 0 && posted.length === 0 && (
        <p className="text-sm text-neutral-500">
          No approved drafts yet. Go to step 3 and approve at least one platform.
        </p>
      )}

      {approved.map((draft) => {
        const isBlog = draft.platform === "blog";
        const busy = draftBusyId === draft.id || publishBusyId === draft.id;

        return (
          <div
            key={draft.id}
            className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-medium">{PLATFORM_LABELS[draft.platform] ?? draft.platform}</h3>
              <span className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(draft.status)}`}>
                approved
              </span>
            </div>
            {!isBlog && (
              <p className="text-xs text-neutral-500">
                Manual post — copy below, paste into {PLATFORM_LABELS[draft.platform] ?? draft.platform}.
              </p>
            )}
            <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-sans max-h-72 overflow-y-auto rounded border border-neutral-800 bg-neutral-950/60 p-3">
              {draftEdits[draft.id] ?? draft.content}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleCopy(draft)}
                className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium"
              >
                Copy to clipboard
              </button>
              {isBlog && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPublishBlog(draft.id)}
                  className="px-4 py-2 rounded-lg border border-emerald-700 bg-emerald-950/50 hover:bg-emerald-900/40 disabled:opacity-50 text-sm font-medium"
                >
                  {publishBusyId === draft.id ? "Publishing…" : "Publish to blog"}
                </button>
              )}
            </div>
            {!isBlog && (
              <div className="flex flex-wrap gap-2 items-end">
                <label className="flex-1 min-w-[12rem] text-xs space-y-1">
                  <span className="text-neutral-500">Live post URL (optional)</span>
                  <input
                    type="url"
                    placeholder="https://x.com/… or https://instagram.com/…"
                    defaultValue={draft.external_post_url ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (draft.external_post_url ?? "")) {
                        onPatch(draft.id, { external_post_url: v || null });
                      }
                    }}
                    className="w-full rounded border border-neutral-600 bg-neutral-950 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPatch(draft.id, { mark_posted: true })}
                  className="px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-sm disabled:opacity-50"
                >
                  Mark posted
                </button>
              </div>
            )}
          </div>
        );
      })}

      {posted.length > 0 && (
        <section className="space-y-3">
          <div className="font-medium text-sm text-neutral-400">Posted / done</div>
          {posted.map((draft) => (
            <div
              key={draft.id}
              className="rounded-lg border border-neutral-700 bg-neutral-900/40 px-4 py-3 flex items-center justify-between gap-2 flex-wrap"
            >
              <span className="text-sm">{PLATFORM_LABELS[draft.platform] ?? draft.platform}</span>
              {draft.external_post_url ? (
                <a
                  href={draft.external_post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-400 hover:underline"
                >
                  View live →
                </a>
              ) : (
                <span className="text-xs text-neutral-500">
                  {draft.posted_at ? new Date(draft.posted_at).toLocaleString() : "Marked posted"}
                </span>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
