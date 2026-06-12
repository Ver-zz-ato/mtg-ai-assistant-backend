"use client";

import React from "react";
import Link from "next/link";
import { DraftsPanel } from "@/components/admin/marketing-radar/DraftsPanel";
import { IngestTab } from "@/components/admin/marketing-radar/IngestTab";
import {
  MarketingRadarTabs,
  type MarketingRadarTab,
} from "@/components/admin/marketing-radar/MarketingRadarTabs";
import { PublishTab } from "@/components/admin/marketing-radar/PublishTab";
import { SummaryTab } from "@/components/admin/marketing-radar/SummaryTab";
import type { MarketingSourceHealthRow } from "@/components/admin/marketing-radar/SetupTab";
import type { SignalFilterState } from "@/components/admin/marketing-radar/SignalFilters";
import type { RadarPayload } from "@/components/admin/marketing-radar/types";
import { ELI5 } from "@/components/AdminHelp";

const VALID_TABS: MarketingRadarTab[] = ["ingest", "summary", "drafts", "publish"];

function parseTabFromUrl(value: string | null): MarketingRadarTab {
  if (value && VALID_TABS.includes(value as MarketingRadarTab)) {
    return value as MarketingRadarTab;
  }
  if (value === "workflow" || value === "collect" || value === "setup") return "ingest";
  return "ingest";
}

function buildQuery(filters: SignalFilterState, briefId: string | null): string {
  const p = new URLSearchParams();
  if (briefId) p.set("brief_id", briefId);
  if (filters.source_type) p.set("source_type", filters.source_type);
  if (filters.topic) p.set("topic", filters.topic);
  if (filters.card) p.set("card", filters.card);
  if (filters.min_score) p.set("min_score", filters.min_score);
  const q = p.toString();
  return q ? `?${q}` : "";
}

function syncUrl(tab: MarketingRadarTab, briefId: string | null) {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  p.set("tab", tab);
  if (briefId) p.set("brief_id", briefId);
  else p.delete("brief_id");
  const next = `${window.location.pathname}?${p.toString()}`;
  window.history.replaceState(null, "", next);
}

export default function MarketingRadarPage() {
  const [tab, setTab] = React.useState<MarketingRadarTab>("ingest");
  const [data, setData] = React.useState<RadarPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [dailyBusy, setDailyBusy] = React.useState(false);
  const [regenerateBusy, setRegenerateBusy] = React.useState(false);
  const [draftBusyId, setDraftBusyId] = React.useState<string | null>(null);
  const [publishBusyId, setPublishBusyId] = React.useState<string | null>(null);
  const [selectedBriefId, setSelectedBriefId] = React.useState<string | null>(null);
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [signalFilters] = React.useState<SignalFilterState>({
    source_type: "",
    topic: "",
    card: "",
    min_score: "",
  });

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setTab(parseTabFromUrl(p.get("tab")));
    const bid = p.get("brief_id");
    if (bid) setSelectedBriefId(bid);
  }, []);

  const goTab = React.useCallback((next: MarketingRadarTab) => {
    setTab(next);
    syncUrl(next, selectedBriefId);
  }, [selectedBriefId]);

  const load = React.useCallback(async (briefId?: string | null) => {
    setError("");
    try {
      const res = await fetch(
        `/api/admin/marketing-radar${buildQuery(signalFilters, briefId ?? selectedBriefId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as RadarPayload;
      if (!json.ok) {
        setError(json.error ?? "Failed to load");
        return;
      }
      setData(json);
      const resolvedBriefId = briefId ?? selectedBriefId ?? json.latest_brief?.id ?? null;
      if (!selectedBriefId && json.latest_brief?.id) {
        setSelectedBriefId(json.latest_brief.id);
      }
      const edits: Record<string, string> = {};
      for (const d of json.drafts ?? []) edits[d.id] = d.content;
      setDraftEdits(edits);
      return resolvedBriefId;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [signalFilters, selectedBriefId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const runDaily = async () => {
    setDailyBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/admin/marketing-radar/daily-run", { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? json.error ?? "Daily run failed");
        return;
      }
      const s = json.summary;
      setInfo(
        [
          `Articles: +${s?.rss?.inserted ?? 0}`,
          `YouTube: +${s?.youtube?.inserted ?? 0}`,
          `Reddit: +${s?.reddit?.inserted ?? 0}`,
          s?.brief?.created ? `Brief: ${s.brief.draftCount} drafts` : "Brief: skipped",
        ].join(" · ")
      );
      if (s?.brief?.briefId) setSelectedBriefId(s.brief.briefId);
      await load(s?.brief?.briefId);
      goTab("summary");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Daily run failed");
    } finally {
      setDailyBusy(false);
    }
  };

  const patchDraft = async (id: string, patch: Record<string, unknown>) => {
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

  const publishDraft = async (
    id: string,
    blogOpts?: { slug?: string; category?: string; gradient?: string; icon?: string }
  ) => {
    setPublishBusyId(id);
    setError("");
    try {
      const draft = (data?.drafts ?? []).find((d) => d.id === id);
      const edited = draftEdits[id];
      if (draft && edited && edited !== draft.content) {
        await patchDraft(id, { content: edited });
      }

      const res = await fetch(`/api/admin/marketing-drafts/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blogOpts ?? {}),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(typeof json.error === "string" ? json.error : "Publish failed");
        return;
      }
      setInfo(
        json.externalPostUrl
          ? `Published! ${json.externalPostUrl}`
          : "Published successfully."
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishBusyId(null);
    }
  };

  const regenerate = async () => {
    if (!selectedBriefId) return;
    setRegenerateBusy(true);
    try {
      const res = await fetch(`/api/admin/marketing-radar/briefs/${selectedBriefId}/regenerate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Regenerate failed");
        return;
      }
      setInfo("Fresh drafts created (posted rows kept; other active drafts superseded).");
      await load(selectedBriefId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegenerateBusy(false);
    }
  };

  const brief = data?.latest_brief ?? null;
  const drafts = data?.drafts ?? [];
  const youtubeOk = !!data?.config?.youtube_api_key_configured;
  const redditOk = !!data?.config?.reddit_api_configured;
  const sourceRows = (data?.sources ?? []) as MarketingSourceHealthRow[];

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Marketing Radar</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Your weekly marketing assistant: scrape what MTG players are talking about, get draft posts, you approve and post manually.
          </p>
        </div>
        <Link
          href="/admin/JustForDavy"
          className="px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-sm"
        >
          Admin hub
        </Link>
      </div>

      <MarketingRadarTabs
        active={tab}
        onChange={(t) => {
          setTab(t);
          syncUrl(t, selectedBriefId);
        }}
      />

      {error && (
        <div className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100 whitespace-pre-wrap">
          {info}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <>
          {tab === "ingest" && (
            <IngestTab
              sources={sourceRows}
              youtubeOk={youtubeOk}
              redditOk={redditOk}
              redditPartial={!!data?.config?.reddit_partial_configured}
              runBusy={dailyBusy}
              onRunDaily={runDaily}
              onIngestDone={() => load()}
              onResult={setInfo}
            />
          )}

          {tab === "summary" && (
            <SummaryTab
              brief={brief}
              briefHistory={data?.brief_history ?? []}
              selectedBriefId={selectedBriefId}
              signals={data?.recent_signals ?? []}
              meta={data?.meta_snapshot ?? null}
              onSelectBrief={(id) => {
                setSelectedBriefId(id);
                syncUrl(tab, id);
                load(id);
              }}
              onGoDrafts={() => goTab("drafts")}
            />
          )}

          {tab === "drafts" && (
            <div className="space-y-5">
              <ELI5
                heading="Step 3 — Pick what you're happy to post"
                items={[
                  "Three tabs worth of content: short X post, Instagram caption, long blog article.",
                  "Read each one. Edit if you want. Approve = send to step 4. Reject = skip that platform.",
                  "Yellow quality warnings are suggestions (e.g. missing link) — they never block you.",
                ]}
              />
              <DraftsPanel
                briefId={selectedBriefId}
                drafts={drafts}
                draftEdits={draftEdits}
                setDraftEdits={setDraftEdits}
                draftBusyId={draftBusyId}
                onPatch={patchDraft}
                onRegenerate={regenerate}
                regenerateBusy={regenerateBusy}
              />
              {drafts.some((d) => d.status === "approved") && (
                <button
                  type="button"
                  onClick={() => goTab("publish")}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium"
                >
                  Go to Copy &amp; post →
                </button>
              )}
            </div>
          )}

          {tab === "publish" && (
            <PublishTab
              drafts={drafts}
              draftEdits={draftEdits}
              publishBusyId={publishBusyId}
              draftBusyId={draftBusyId}
              onPublishBlog={publishDraft}
              onPatch={patchDraft}
              onCopied={() => setInfo("Copied to clipboard.")}
            />
          )}
        </>
      )}
    </main>
  );
}
