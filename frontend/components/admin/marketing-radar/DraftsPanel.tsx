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
}: Props) {
  const [draftPlatform, setDraftPlatform] = React.useState("");
  const [draftStatus, setDraftStatus] = React.useState("");

  const filtered = drafts.filter((d) => {
    if (draftPlatform && d.platform !== draftPlatform) return false;
    if (draftStatus && d.status !== draftStatus) return false;
    return true;
  });

  const xDrafts = drafts.filter((d) => d.platform === "x" && d.status !== "superseded");
  const blogDraft = drafts.find((d) => d.platform === "blog");
  const igDraft = drafts.find((d) => d.platform === "instagram");

  const copyAllX = async () => {
    const text = xDrafts.map((d, i) => `--- X ${i + 1} ---\n${draftEdits[d.id] ?? d.content}`).join("\n\n");
    await copyText(text);
  };

  if (!briefId) return null;

  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Drafts</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={regenerateBusy}
            onClick={onRegenerate}
            className="px-3 py-1.5 text-xs rounded border border-purple-800 bg-purple-950/40 hover:bg-purple-900/30 disabled:opacity-50"
          >
            {regenerateBusy ? "Regenerating…" : "Regenerate drafts"}
          </button>
          <a
            href={`/api/admin/marketing-radar/export.csv?brief_id=${briefId}`}
            className="px-3 py-1.5 text-xs rounded border border-neutral-600 bg-neutral-800 hover:bg-neutral-700"
          >
            Export CSV
          </a>
          {xDrafts.length > 0 && (
            <button type="button" onClick={copyAllX} className="px-3 py-1.5 text-xs rounded border border-neutral-600 bg-neutral-800">
              Copy all X
            </button>
          )}
          {blogDraft && (
            <button
              type="button"
              onClick={() => copyText(draftEdits[blogDraft.id] ?? blogDraft.content)}
              className="px-3 py-1.5 text-xs rounded border border-neutral-600 bg-neutral-800"
            >
              Copy blog
            </button>
          )}
          {igDraft && (
            <button
              type="button"
              onClick={() => copyText(draftEdits[igDraft.id] ?? igDraft.content)}
              className="px-3 py-1.5 text-xs rounded border border-neutral-600 bg-neutral-800"
            >
              Copy Instagram
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <select
          value={draftPlatform}
          onChange={(e) => setDraftPlatform(e.target.value)}
          className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1"
        >
          <option value="">All platforms</option>
          {MARKETING_PLATFORMS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={draftStatus}
          onChange={(e) => setDraftStatus(e.target.value)}
          className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1"
        >
          <option value="">All statuses</option>
          <option value="draft">draft</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
      </div>

      {MARKETING_PLATFORMS.map((platform) => {
        const platformDrafts = filtered.filter((d) => d.platform === platform);
        if (!platformDrafts.length) return null;
        return (
          <div key={platform} className="space-y-3">
            <h3 className="text-sm font-medium text-emerald-300/90">
              {PLATFORM_LABELS[platform] ?? platform}
            </h3>
            {platformDrafts.map((draft, idx) => {
              const flags = qualityFlags(draft);
              return (
                <div
                  key={draft.id}
                  className="rounded-lg border border-neutral-700 bg-neutral-950/60 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs text-neutral-500">Draft {idx + 1}</span>
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
                    rows={platform === "blog" ? 8 : 4}
                    className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="datetime-local"
                      defaultValue={
                        draft.scheduled_for
                          ? new Date(draft.scheduled_for).toISOString().slice(0, 16)
                          : ""
                      }
                      onBlur={(e) => {
                        const v = e.target.value;
                        onPatch(draft.id, {
                          scheduled_for: v ? new Date(v).toISOString() : null,
                        });
                      }}
                      className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-xs"
                    />
                    <input
                      placeholder="Campaign name"
                      defaultValue={draft.campaign ?? ""}
                      onBlur={(e) => onPatch(draft.id, { campaign: e.target.value || null })}
                      className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-xs"
                    />
                    <input
                      placeholder="External post URL (after manual post)"
                      defaultValue={draft.external_post_url ?? ""}
                      onBlur={(e) =>
                        onPatch(draft.id, { external_post_url: e.target.value || null })
                      }
                      className="rounded border border-neutral-600 bg-neutral-950 px-2 py-1 text-xs sm:col-span-2"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={draftBusyId === draft.id}
                      onClick={() =>
                        onPatch(draft.id, { content: draftEdits[draft.id] ?? draft.content })
                      }
                      className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-800 text-xs disabled:opacity-50"
                    >
                      Save
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
                      onClick={() => onPatch(draft.id, { mark_copied: true })}
                      className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-800 text-xs disabled:opacity-50"
                    >
                      Mark copied
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
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
