"use client";

import React from "react";
import {
  MARKETING_PLATFORMS,
  type MarketingDraftRow,
} from "@/lib/marketing/marketingBriefSchema";
import { copyText, PLATFORM_LABELS, statusBadgeClass } from "./types";

type Props = {
  briefId: string | null;
  drafts: MarketingDraftRow[];
  draftEdits: Record<string, string>;
  setDraftEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  draftBusyId: string | null;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onRegenerate: () => Promise<void>;
  regenerateBusy: boolean;
  mode?: "review" | "readonly";
};

function qualityFlags(draft: MarketingDraftRow): string[] {
  if (!Array.isArray(draft.quality_flags)) return [];
  return draft.quality_flags.filter((f): f is string => typeof f === "string");
}

export function DraftsPanel({
  briefId,
  drafts,
  draftEdits,
  setDraftEdits,
  draftBusyId,
  onPatch,
  onRegenerate,
  regenerateBusy,
  mode = "review",
}: Props) {
  if (!briefId) {
    return (
      <p className="text-sm text-neutral-500">
        Run ingestion first (step 1) to create a brief and drafts.
      </p>
    );
  }

  const activeDrafts = MARKETING_PLATFORMS.map((platform) =>
    drafts.find((d) => d.platform === platform && d.status !== "superseded")
  ).filter((d): d is MarketingDraftRow => !!d);

  const approvedCount = activeDrafts.filter((d) => d.status === "approved").length;

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">One draft per platform</div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Edit if needed, then Approve or Reject. Approved posts move to Publish (step 4).
            {approvedCount > 0 && (
              <span className="text-emerald-400 ml-1">{approvedCount} approved</span>
            )}
          </p>
        </div>
        {mode === "review" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={regenerateBusy}
              onClick={onRegenerate}
              className="px-3 py-1.5 text-xs rounded border border-purple-800 bg-purple-950/40 hover:bg-purple-900/30 disabled:opacity-50"
            >
              {regenerateBusy ? "Regenerating…" : "Regenerate all drafts"}
            </button>
            <a
              href={`/api/admin/marketing-radar/export.csv?brief_id=${briefId}`}
              className="px-3 py-1.5 text-xs rounded border border-neutral-600 bg-neutral-800 hover:bg-neutral-700"
            >
              Export CSV
            </a>
          </div>
        )}
      </div>

      {activeDrafts.length === 0 && (
        <p className="text-sm text-neutral-500">No active drafts for this brief.</p>
      )}

      {MARKETING_PLATFORMS.map((platform) => {
        const draft = activeDrafts.find((d) => d.platform === platform);
        if (!draft) {
          return (
            <div
              key={platform}
              className="rounded-lg border border-dashed border-neutral-700 px-3 py-4 text-sm text-neutral-500"
            >
              {PLATFORM_LABELS[platform] ?? platform}: no draft — regenerate or run a new brief.
            </div>
          );
        }

        const flags = qualityFlags(draft);
        const isPosted = draft.status === "posted";
        const readOnly = mode === "readonly" || isPosted;

        return (
          <div
            key={draft.id}
            className="rounded-lg border border-neutral-700 bg-neutral-950/60 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-emerald-300/90">
                {PLATFORM_LABELS[platform] ?? platform}
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(draft.status)}`}>
                {draft.status}
              </span>
            </div>
            {flags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {flags.map((f) => (
                  <span
                    key={f}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-amber-800/60 bg-amber-950/40 text-amber-200"
                  >
                    {f.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
            <textarea
              value={draftEdits[draft.id] ?? draft.content}
              onChange={(e) =>
                setDraftEdits((prev) => ({ ...prev, [draft.id]: e.target.value }))
              }
              readOnly={readOnly}
              rows={platform === "blog" ? 18 : platform === "instagram" ? 6 : 4}
              className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm disabled:opacity-70"
            />
            {platform === "blog" && (
              <p className="text-[11px] text-neutral-500">
                Blog posts should be long-form (800+ words). Starts with # Title in markdown.
              </p>
            )}
            {!readOnly && mode === "review" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={draftBusyId === draft.id}
                  onClick={() =>
                    onPatch(draft.id, { content: draftEdits[draft.id] ?? draft.content })
                  }
                  className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-800 text-xs disabled:opacity-50"
                >
                  Save edits
                </button>
                <button
                  type="button"
                  onClick={() => copyText(draftEdits[draft.id] ?? draft.content)}
                  className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-800 text-xs"
                >
                  Copy
                </button>
                <button
                  type="button"
                  disabled={draftBusyId === draft.id}
                  onClick={() => onPatch(draft.id, { status: "approved" })}
                  className="px-3 py-1.5 rounded border border-emerald-800 bg-emerald-950/50 text-xs disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={draftBusyId === draft.id}
                  onClick={() => onPatch(draft.id, { status: "rejected" })}
                  className="px-3 py-1.5 rounded border border-red-900 bg-red-950/30 text-xs disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
            {isPosted && draft.external_post_url && (
              <a
                href={draft.external_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-emerald-400 hover:underline"
              >
                View live post →
              </a>
            )}
          </div>
        );
      })}
    </section>
  );
}
