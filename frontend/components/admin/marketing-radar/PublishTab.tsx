"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";
import {
  MARKETING_PLATFORMS,
  type MarketingDraftRow,
} from "@/lib/marketing/marketingBriefSchema";
import { copyText, PLATFORM_LABELS, statusBadgeClass } from "./types";

type PublishConfig = {
  x?: boolean;
  instagram?: boolean;
  blog?: boolean;
  discord_notify?: boolean;
};

type Props = {
  drafts: MarketingDraftRow[];
  draftEdits: Record<string, string>;
  publishConfig?: PublishConfig;
  publishBusyId: string | null;
  onPublish: (id: string) => Promise<void>;
};

export function PublishTab({
  drafts,
  draftEdits,
  publishConfig,
  publishBusyId,
  onPublish,
}: Props) {
  const approved = MARKETING_PLATFORMS.map((platform) =>
    drafts.find((d) => d.platform === platform && d.status === "approved")
  ).filter((d): d is MarketingDraftRow => !!d);

  const posted = MARKETING_PLATFORMS.map((platform) =>
    drafts.find((d) => d.platform === platform && d.status === "posted")
  ).filter((d): d is MarketingDraftRow => !!d);

  function platformConfigured(platform: string): boolean {
    if (platform === "x") return !!publishConfig?.x;
    if (platform === "instagram") return !!publishConfig?.instagram;
    if (platform === "blog") return publishConfig?.blog !== false;
    return false;
  }

  return (
    <div className="space-y-5">
      <ELI5
        heading="Step 4 — Publish approved posts"
        items={[
          "Only approved drafts appear here. Hit Post to publish to X, Instagram, or the blog.",
          "Blog posts go live on manatap.ai/blog (long-form, ~weekly is fine).",
          "Configure API keys in Vercel env — see MARKETING_RADAR.md.",
        ]}
      />

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-2">
        <div className="font-medium text-sm">Publish integrations</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["x", "instagram", "blog"] as const).map((p) => (
            <span
              key={p}
              className={`px-2 py-1 rounded border ${
                platformConfigured(p)
                  ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
                  : "border-amber-800/60 bg-amber-950/30 text-amber-200"
              }`}
            >
              {PLATFORM_LABELS[p]}: {platformConfigured(p) ? "ready" : "not configured"}
            </span>
          ))}
          <span
            className={`px-2 py-1 rounded border ${
              publishConfig?.discord_notify
                ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
                : "border-neutral-700 bg-neutral-900 text-neutral-400"
            }`}
          >
            Discord review alerts: {publishConfig?.discord_notify ? "on" : "off"}
          </span>
        </div>
      </section>

      {approved.length === 0 && posted.length === 0 && (
        <p className="text-sm text-neutral-500">
          No approved drafts yet. Go to step 3 and approve at least one platform.
        </p>
      )}

      {approved.map((draft) => {
        const configured = platformConfigured(draft.platform);
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
            <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto rounded border border-neutral-800 bg-neutral-950/60 p-3">
              {draftEdits[draft.id] ?? draft.content}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!configured || publishBusyId === draft.id}
                onClick={() => onPublish(draft.id)}
                className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium"
              >
                {publishBusyId === draft.id
                  ? "Publishing…"
                  : `Post to ${PLATFORM_LABELS[draft.platform] ?? draft.platform}`}
              </button>
              <button
                type="button"
                onClick={() => copyText(draftEdits[draft.id] ?? draft.content)}
                className="px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-sm"
              >
                Copy (manual fallback)
              </button>
            </div>
            {!configured && (
              <p className="text-xs text-amber-300/90">
                API credentials missing for this platform — use Copy or add env vars.
              </p>
            )}
          </div>
        );
      })}

      {posted.length > 0 && (
        <section className="space-y-3">
          <div className="font-medium text-sm text-neutral-400">Already published</div>
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
                <span className="text-xs text-neutral-500">Posted {draft.posted_at ? new Date(draft.posted_at).toLocaleString() : ""}</span>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
