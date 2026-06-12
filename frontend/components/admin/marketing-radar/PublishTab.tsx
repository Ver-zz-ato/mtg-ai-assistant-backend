"use client";

import React from "react";
import { ELI5 } from "@/components/AdminHelp";
import {
  MARKETING_PLATFORMS,
  type MarketingDraftRow,
} from "@/lib/marketing/marketingBriefSchema";
import { slugifyBlogTitle, titleFromContent } from "@/lib/blog/blogHelpers";
import { copyText, PLATFORM_LABELS, statusBadgeClass } from "./types";

const BLOG_CATEGORIES = ["Commander", "Strategy", "Budget Building", "Announcement"] as const;

const GRADIENT_PRESETS = [
  "from-emerald-600 via-teal-600 to-cyan-600",
  "from-red-600 via-blue-600 to-indigo-600",
  "from-orange-600 via-red-600 to-rose-600",
  "from-blue-600 via-cyan-600 to-indigo-600",
  "from-violet-600 via-purple-600 to-indigo-600",
];

const ICON_PRESETS = ["📰", "🦸", "🎯", "💎", "⚠️", "🌍", "🔬", "✨"];

type BlogPublishOpts = {
  slug: string;
  category: string;
  gradient: string;
  icon: string;
};

type Props = {
  drafts: MarketingDraftRow[];
  draftEdits: Record<string, string>;
  publishBusyId: string | null;
  draftBusyId: string | null;
  onPublishBlog: (id: string, opts?: Omit<BlogPublishOpts, never>) => Promise<void>;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onCopied?: () => void;
};

function defaultBlogOpts(content: string): BlogPublishOpts {
  const title = titleFromContent(content);
  return {
    slug: slugifyBlogTitle(title),
    category: "Strategy",
    gradient: GRADIENT_PRESETS[0],
    icon: "📰",
  };
}

export function PublishTab({
  drafts,
  draftEdits,
  publishBusyId,
  draftBusyId,
  onPublishBlog,
  onPatch,
  onCopied,
}: Props) {
  const [blogOpts, setBlogOpts] = React.useState<Record<string, BlogPublishOpts>>({});
  const [copySqlBusyId, setCopySqlBusyId] = React.useState<string | null>(null);

  const approved = MARKETING_PLATFORMS.map((platform) =>
    drafts.find((d) => d.platform === platform && d.status === "approved")
  ).filter((d): d is MarketingDraftRow => !!d);

  const posted = MARKETING_PLATFORMS.map((platform) =>
    drafts.find((d) => d.platform === platform && d.status === "posted")
  ).filter((d): d is MarketingDraftRow => !!d);

  const getBlogOpts = (draft: MarketingDraftRow): BlogPublishOpts => {
    const content = draftEdits[draft.id] ?? draft.content;
    return blogOpts[draft.id] ?? defaultBlogOpts(content);
  };

  const setOpts = (draftId: string, patch: Partial<BlogPublishOpts>) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return;
    setBlogOpts((prev) => ({
      ...prev,
      [draftId]: { ...(prev[draftId] ?? defaultBlogOpts(draftEdits[draft.id] ?? draft.content)), ...patch },
    }));
  };

  const handleCopy = async (draft: MarketingDraftRow) => {
    await copyText(draftEdits[draft.id] ?? draft.content);
    await onPatch(draft.id, { mark_copied: true });
    onCopied?.();
  };

  const copySqlForBlog = async (draft: MarketingDraftRow) => {
    const content = (draftEdits[draft.id] ?? draft.content).trim();
    const opts = getBlogOpts(draft);
    setCopySqlBusyId(draft.id);
    try {
      const res = await fetch("/api/admin/blog/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: opts.slug.trim() || slugifyBlogTitle(titleFromContent(content)),
          title: titleFromContent(content),
          excerpt: "",
          date: new Date().toISOString().slice(0, 10),
          author: "ManaTap Team",
          category: opts.category,
          readTime: "",
          gradient: opts.gradient,
          icon: opts.icon,
          content,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "SQL failed");
      await copyText(json.sql);
      onCopied?.();
    } finally {
      setCopySqlBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <ELI5
        heading="Step 4 — Copy and post"
        items={[
          "X and Instagram: copy the text, paste into each app yourself (no API fees).",
          "Blog: set slug/category, then Publish to blog — writes Supabase listing + body (website + app).",
          "Copy SQL: same post as a Supabase script for backup or manual publish.",
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
        const opts = isBlog ? getBlogOpts(draft) : null;

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

            {isBlog && opts && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <label className="space-y-1">
                  <span className="text-xs text-neutral-500">Custom slug (optional)</span>
                  <input
                    type="text"
                    value={opts.slug}
                    onChange={(e) => setOpts(draft.id, { slug: e.target.value })}
                    className="w-full rounded border border-neutral-600 bg-neutral-950 px-2 py-1.5 font-mono text-sm"
                    placeholder="2026-06-12-my-post"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-neutral-500">Category</span>
                  <select
                    value={opts.category}
                    onChange={(e) => setOpts(draft.id, { category: e.target.value })}
                    className="w-full rounded border border-neutral-600 bg-neutral-950 px-2 py-1.5"
                  >
                    {BLOG_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-neutral-500">Gradient</span>
                  <select
                    value={opts.gradient}
                    onChange={(e) => setOpts(draft.id, { gradient: e.target.value })}
                    className="w-full rounded border border-neutral-600 bg-neutral-950 px-2 py-1.5"
                  >
                    {GRADIENT_PRESETS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-neutral-500">Icon</span>
                  <div className="flex flex-wrap gap-1">
                    {ICON_PRESETS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setOpts(draft.id, { icon: ic })}
                        className={`px-2 py-1 rounded ${opts.icon === ic ? "bg-emerald-700" : "bg-neutral-800"}`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleCopy(draft)}
                className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium"
              >
                Copy to clipboard
              </button>
              {isBlog && opts && (
                <>
                  <button
                    type="button"
                    disabled={busy || copySqlBusyId === draft.id}
                    onClick={() => copySqlForBlog(draft)}
                    className="px-4 py-2 rounded-lg border border-neutral-600 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-sm"
                  >
                    {copySqlBusyId === draft.id ? "Copying SQL…" : "Copy SQL"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onPublishBlog(draft.id, {
                        slug: opts.slug.trim() || undefined,
                        category: opts.category,
                        gradient: opts.gradient,
                        icon: opts.icon,
                      })
                    }
                    className="px-4 py-2 rounded-lg border border-emerald-700 bg-emerald-950/50 hover:bg-emerald-900/40 disabled:opacity-50 text-sm font-medium"
                  >
                    {publishBusyId === draft.id ? "Publishing…" : "Publish to blog"}
                  </button>
                </>
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
