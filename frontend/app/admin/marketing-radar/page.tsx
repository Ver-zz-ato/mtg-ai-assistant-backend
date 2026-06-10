"use client";

import React from "react";
import Link from "next/link";
import { ELI5 } from "@/components/AdminHelp";
import {
  MARKETING_PLATFORMS,
  stringifyBriefItem,
  type MarketingBriefRow,
  type MarketingDraftRow,
  type MarketingMetaSnapshot,
  type MarketingSignalRow,
} from "@/lib/marketing/marketingBriefSchema";

type RadarPayload = {
  ok: boolean;
  latest_brief: MarketingBriefRow | null;
  drafts: MarketingDraftRow[];
  drafts_by_platform: Record<string, MarketingDraftRow[]>;
  recent_signals: MarketingSignalRow[];
  meta_snapshot: MarketingMetaSnapshot;
  error?: string;
};

const PLATFORM_LABELS: Record<string, string> = {
  x: "X (Twitter)",
  instagram: "Instagram",
  blog: "Blog",
  reddit: "Reddit",
};

function statusBadgeClass(status: string): string {
  if (status === "approved") return "bg-emerald-900/60 text-emerald-300 border-emerald-700";
  if (status === "rejected") return "bg-red-900/40 text-red-300 border-red-800";
  return "bg-neutral-800 text-neutral-300 border-neutral-600";
}

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

export default function MarketingRadarPage() {
  const [data, setData] = React.useState<RadarPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [runBusy, setRunBusy] = React.useState(false);
  const [signalBusy, setSignalBusy] = React.useState(false);
  const [draftBusyId, setDraftBusyId] = React.useState<string | null>(null);

  const [pasteTitle, setPasteTitle] = React.useState("");
  const [pasteUrl, setPasteUrl] = React.useState("");
  const [pasteText, setPasteText] = React.useState("");
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/marketing-radar", { cache: "no-store" });
      const json = (await res.json()) as RadarPayload;
      if (!json.ok) {
        setError(json.error ?? "Failed to load marketing radar");
        return;
      }
      setData(json);
      const edits: Record<string, string> = {};
      for (const d of json.drafts ?? []) edits[d.id] = d.content;
      setDraftEdits(edits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const addSignal = async () => {
    if (!pasteText.trim()) return;
    setSignalBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/marketing-radar/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pasteTitle.trim() || null,
          url: pasteUrl.trim() || null,
          raw_text: pasteText.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(typeof json.error === "string" ? json.error : "Failed to add signal");
        return;
      }
      setPasteText("");
      setPasteTitle("");
      setPasteUrl("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add signal");
    } finally {
      setSignalBusy(false);
    }
  };

  const runBrief = async () => {
    setRunBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/marketing-radar/run", { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? json.error ?? "Brief run failed");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brief run failed");
    } finally {
      setRunBusy(false);
    }
  };

  const patchDraft = async (
    id: string,
    patch: { content?: string; status?: string; notes?: string | null }
  ) => {
    setDraftBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/marketing-drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(typeof json.error === "string" ? json.error : "Draft update failed");
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft update failed");
    } finally {
      setDraftBusyId(null);
    }
  };

  const brief = data?.latest_brief ?? null;
  const meta = data?.meta_snapshot;

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Marketing Radar</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Internal only. Drafts for manual copy/paste to X, Instagram, blog, and Reddit.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/JustForDavy"
            className="px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-sm"
          >
            Admin hub
          </Link>
          <button
            type="button"
            onClick={runBrief}
            disabled={runBusy || loading}
            className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium"
          >
            {runBusy ? "Running brief…" : "Run brief"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <ELI5
        heading="Marketing Radar"
        items={[
          "Paste MTG community chatter (Reddit, forums, Discord) as manual signals.",
          "Each run blends your signals with Discover meta_signals (trending cards/commanders).",
          "AI generates a brief and platform drafts — you approve and copy manually. Nothing auto-posts.",
        ]}
      />

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
          <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
            <div className="font-medium">Add manual signal</div>
            <p className="text-xs text-neutral-500">
              Paste a Reddit thread, Discord snippet, or forum post. Card names in decklist format are
              auto-detected.
            </p>
            <input
              type="text"
              placeholder="Title (optional)"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm"
            />
            <input
              type="url"
              placeholder="URL (optional)"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Paste discussion text…"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm font-mono"
            />
            <button
              type="button"
              onClick={addSignal}
              disabled={signalBusy || !pasteText.trim()}
              className="px-3 py-2 rounded-lg border border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40 disabled:opacity-50 text-sm"
            >
              {signalBusy ? "Adding…" : "Add signal"}
            </button>
          </section>

          <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-3">
            <div className="font-medium">Discover meta context</div>
            <p className="text-xs text-neutral-500">
              Blended from <code className="bg-black/40 px-1 rounded">meta_signals</code> on each brief
              run.
            </p>
            {meta ? (
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <div className="text-neutral-400 text-xs mb-1">Trending cards</div>
                  <ChipList items={meta.trending_cards} empty="No card data yet" />
                </div>
                <div>
                  <div className="text-neutral-400 text-xs mb-1">Trending commanders</div>
                  <ChipList items={meta.trending_commanders} empty="No commander data yet" />
                </div>
                <div>
                  <div className="text-neutral-400 text-xs mb-1">New set breakouts</div>
                  <ChipList items={meta.new_set_breakouts} empty="No breakout data yet" />
                </div>
                <div>
                  <div className="text-neutral-400 text-xs mb-1">Meta label</div>
                  <p className="text-neutral-200">{meta.meta_label ?? "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No meta snapshot loaded.</p>
            )}
          </section>

          <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-medium">Latest brief</div>
              {brief && (
                <span className="text-xs text-neutral-500">
                  {brief.brief_date} · {new Date(brief.created_at).toLocaleString()}
                </span>
              )}
            </div>
            {!brief ? (
              <p className="text-sm text-neutral-500">
                No brief yet. Add signals and click Run brief.
              </p>
            ) : (
              <>
                <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
                  {brief.summary}
                </p>
                <div>
                  <div className="text-xs text-neutral-400 mb-1">Trending cards</div>
                  <ChipList
                    items={Array.isArray(brief.trending_cards) ? brief.trending_cards : []}
                    empty="None identified"
                  />
                </div>
                <div>
                  <div className="text-xs text-neutral-400 mb-1">Trending topics</div>
                  <ChipList
                    items={Array.isArray(brief.trending_topics) ? brief.trending_topics : []}
                    empty="None identified"
                  />
                </div>
                <div>
                  <div className="text-xs text-neutral-400 mb-1">Opportunities</div>
                  {Array.isArray(brief.opportunities) && brief.opportunities.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {brief.opportunities.map((opp, i) => (
                        <li
                          key={i}
                          className="rounded border border-neutral-700 bg-neutral-950/50 px-3 py-2"
                        >
                          {stringifyBriefItem(opp)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-neutral-500">None identified</p>
                  )}
                </div>
              </>
            )}
          </section>

          {brief && (
            <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-4">
              <div className="font-medium">Drafts by platform</div>
              {MARKETING_PLATFORMS.map((platform) => {
                const platformDrafts = data?.drafts_by_platform?.[platform] ?? [];
                if (platformDrafts.length === 0) return null;
                return (
                  <div key={platform} className="space-y-3">
                    <h3 className="text-sm font-medium text-emerald-300/90">
                      {PLATFORM_LABELS[platform] ?? platform}
                    </h3>
                    {platformDrafts.map((draft, idx) => (
                      <div
                        key={draft.id}
                        className="rounded-lg border border-neutral-700 bg-neutral-950/60 p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs text-neutral-500">
                            Draft {idx + 1}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded border ${statusBadgeClass(draft.status)}`}
                          >
                            {draft.status}
                          </span>
                        </div>
                        <textarea
                          value={draftEdits[draft.id] ?? draft.content}
                          onChange={(e) =>
                            setDraftEdits((prev) => ({ ...prev, [draft.id]: e.target.value }))
                          }
                          rows={platform === "blog" ? 8 : 4}
                          className="w-full rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={draftBusyId === draft.id}
                            onClick={() =>
                              patchDraft(draft.id, {
                                content: draftEdits[draft.id] ?? draft.content,
                              })
                            }
                            className="px-3 py-1.5 rounded border border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={draftBusyId === draft.id}
                            onClick={() => patchDraft(draft.id, { status: "approved" })}
                            className="px-3 py-1.5 rounded border border-emerald-800 bg-emerald-950/50 hover:bg-emerald-900/40 text-xs disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={draftBusyId === draft.id}
                            onClick={() => patchDraft(draft.id, { status: "rejected" })}
                            className="px-3 py-1.5 rounded border border-red-900 bg-red-950/30 hover:bg-red-900/30 text-xs disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          )}

          <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
            <div className="font-medium">Recent signals</div>
            {(data?.recent_signals?.length ?? 0) === 0 ? (
              <p className="text-sm text-neutral-500">No signals in the last 7 days.</p>
            ) : (
              <ul className="space-y-2">
                {data?.recent_signals?.map((s) => (
                  <li
                    key={s.id}
                    className="rounded border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium text-neutral-200">
                        {s.title ?? "(untitled)"}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {s.source_type} · {new Date(s.created_at).toLocaleString()}
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
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-3">
                      {s.raw_text?.slice(0, 280)}
                      {(s.raw_text?.length ?? 0) > 280 ? "…" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
