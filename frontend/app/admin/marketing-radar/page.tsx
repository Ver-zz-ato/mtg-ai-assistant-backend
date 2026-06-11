"use client";

import React from "react";
import Link from "next/link";
import { ELI5 } from "@/components/AdminHelp";
import { BriefDetail } from "@/components/admin/marketing-radar/BriefDetail";
import { BriefHistory } from "@/components/admin/marketing-radar/BriefHistory";
import { CalendarView } from "@/components/admin/marketing-radar/CalendarView";
import { DraftsPanel } from "@/components/admin/marketing-radar/DraftsPanel";
import { IngestActions } from "@/components/admin/marketing-radar/IngestActions";
import { ManualSignalForm } from "@/components/admin/marketing-radar/ManualSignalForm";
import {
  MarketingRadarTabs,
  type MarketingRadarTab,
} from "@/components/admin/marketing-radar/MarketingRadarTabs";
import { SetupTab, type MarketingSourceHealthRow } from "@/components/admin/marketing-radar/SetupTab";
import { SignalFilters, type SignalFilterState } from "@/components/admin/marketing-radar/SignalFilters";
import { SignalsList } from "@/components/admin/marketing-radar/SignalsList";
import type { RadarPayload } from "@/components/admin/marketing-radar/types";
import { WorkflowTab } from "@/components/admin/marketing-radar/WorkflowTab";
import type { MarketingMetaSnapshot } from "@/lib/marketing/marketingBriefSchema";

function MetaPanel({ meta }: { meta: MarketingMetaSnapshot | null }) {
  if (!meta) return null;
  const chip = (items: string[]) =>
    items.length ? (
      <div className="flex flex-wrap gap-1">
        {items.map((n) => (
          <span key={n} className="text-xs px-2 py-0.5 rounded-full border border-neutral-600 bg-neutral-800/80">
            {n}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-xs text-neutral-500">—</span>
    );

  return (
    <section className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 space-y-3">
      <div>
        <div className="font-medium">What ManaTap players care about right now</div>
        <p className="text-sm text-neutral-500 mt-1">From Discover meta signals — mixed into your AI brief.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <div className="text-neutral-400 text-xs mb-1">Trending cards</div>
          {chip(meta.trending_cards)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">Trending commanders</div>
          {chip(meta.trending_commanders)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">New set breakouts</div>
          {chip(meta.new_set_breakouts)}
        </div>
        <div>
          <div className="text-neutral-400 text-xs mb-1">Meta label</div>
          <p className="text-neutral-200 text-sm">{meta.meta_label ?? "—"}</p>
        </div>
      </div>
    </section>
  );
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

export default function MarketingRadarPage() {
  const [tab, setTab] = React.useState<MarketingRadarTab>("workflow");
  const [data, setData] = React.useState<RadarPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [runBusy, setRunBusy] = React.useState(false);
  const [dailyBusy, setDailyBusy] = React.useState(false);
  const [signalBusy, setSignalBusy] = React.useState(false);
  const [regenerateBusy, setRegenerateBusy] = React.useState(false);
  const [draftBusyId, setDraftBusyId] = React.useState<string | null>(null);
  const [selectedBriefId, setSelectedBriefId] = React.useState<string | null>(null);

  const [pasteTitle, setPasteTitle] = React.useState("");
  const [pasteUrl, setPasteUrl] = React.useState("");
  const [pasteText, setPasteText] = React.useState("");
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [signalFilters, setSignalFilters] = React.useState<SignalFilterState>({
    source_type: "",
    topic: "",
    card: "",
    min_score: "",
  });

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
      if (!briefId && !selectedBriefId && json.latest_brief?.id) {
        setSelectedBriefId(json.latest_brief.id);
      }
      const edits: Record<string, string> = {};
      for (const d of json.drafts ?? []) edits[d.id] = d.content;
      setDraftEdits(edits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [signalFilters, selectedBriefId]);

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
      setInfo("Saved manual signal.");
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
      if (json.brief?.id) setSelectedBriefId(json.brief.id);
      setInfo(`Brief created with ${json.draftCount ?? "?"} drafts.`);
      setTab("drafts");
      await load(json.brief?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brief run failed");
    } finally {
      setRunBusy(false);
    }
  };

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
      setTab("drafts");
      await load(s?.brief?.briefId);
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
      setInfo("New drafts created (old draft/rejected rows superseded).");
      await load(selectedBriefId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegenerateBusy(false);
    }
  };

  const brief = data?.latest_brief ?? null;
  const drafts = data?.drafts ?? [];
  const pendingDraftCount = drafts.filter((d) => d.status === "draft").length;
  const youtubeOk = !!data?.config?.youtube_api_key_configured;
  const redditOk = !!data?.config?.reddit_api_configured;
  const sourceRows = (data?.sources ?? []) as MarketingSourceHealthRow[];

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Marketing Radar</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Spot MTG trends → AI writes drafts → you copy & post manually.
          </p>
        </div>
        <Link
          href="/admin/JustForDavy"
          className="px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-sm"
        >
          Admin hub
        </Link>
      </div>

      <MarketingRadarTabs active={tab} onChange={setTab} />

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
          {tab === "workflow" && (
            <WorkflowTab
              signalCount={data?.recent_signals?.length ?? 0}
              draftCount={drafts.length}
              pendingDraftCount={pendingDraftCount}
              briefDate={brief?.brief_date ?? null}
              runBusy={dailyBusy || runBusy}
              onRunDaily={runDaily}
              onRunBrief={runBrief}
              onGoTab={setTab}
              youtubeOk={youtubeOk}
              redditOk={redditOk}
            />
          )}

          {tab === "collect" && (
            <div className="space-y-5">
              <ELI5
                heading="Collect topics"
                items={[
                  "Hit the buttons to pull fresh articles and videos into your signal inbox.",
                  "If Reddit is broken, paste thread text manually — it scores the same way.",
                  "Signals from the last 7 days feed into the AI brief (top scores win).",
                ]}
              />
              <IngestActions
                youtubeConfigured={youtubeOk}
                redditConfigured={redditOk}
                onResult={setInfo}
                onDone={() => load()}
              />
              <ManualSignalForm
                title={pasteTitle}
                url={pasteUrl}
                text={pasteText}
                busy={signalBusy}
                onTitle={setPasteTitle}
                onUrl={setPasteUrl}
                onText={setPasteText}
                onSubmit={addSignal}
              />
              <MetaPanel meta={data?.meta_snapshot ?? null} />
              <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
                <div className="font-medium">Saved signals</div>
                <SignalFilters
                  filters={signalFilters}
                  onChange={setSignalFilters}
                  onApply={() => load(selectedBriefId)}
                />
                <SignalsList signals={data?.recent_signals ?? []} />
              </section>
            </div>
          )}

          {tab === "drafts" && (
            <div className="space-y-5">
              <ELI5
                heading="AI drafts"
                items={[
                  "OpenAI turns signals into real posts with manatap.ai links (deck tools, mulligan, etc.).",
                  "Amber chips = warnings (e.g. analyst voice, missing link) — they don't block approve.",
                  "Hit Regenerate for a fresh batch; approved drafts stay when you regenerate.",
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runBrief}
                  disabled={runBusy || loading}
                  className="px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium"
                >
                  {runBusy ? "Writing brief…" : "Run AI brief"}
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
                  <div className="font-medium">Past briefs</div>
                  <BriefHistory
                    items={data?.brief_history ?? []}
                    selectedId={selectedBriefId}
                    onSelect={(id) => {
                      setSelectedBriefId(id);
                      load(id);
                    }}
                  />
                </section>
                <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">Brief summary</div>
                    {brief && (
                      <span className="text-xs text-neutral-500">
                        {brief.brief_date} · {new Date(brief.created_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <BriefDetail brief={brief} />
                </section>
              </div>
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
            </div>
          )}

          {tab === "publish" && (
            <div className="space-y-5">
              <ELI5
                heading="Post & schedule"
                items={[
                  "Approve a draft → Copy → paste into X / Instagram / blog / Reddit yourself.",
                  "Mark copied when done; add the live URL if you want a record.",
                  "Set a planned date to see posts on the content calendar.",
                ]}
              />
              <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4 space-y-3">
                <div className="font-medium">Content calendar</div>
                <p className="text-sm text-neutral-500">
                  Drafts with a planned date show here. Edit dates on the AI drafts tab.
                </p>
                <CalendarView drafts={data?.calendar_drafts ?? drafts} />
              </section>
              {selectedBriefId && (
                <a
                  href={`/api/admin/marketing-radar/export.csv?brief_id=${selectedBriefId}`}
                  className="inline-flex px-4 py-2 rounded-lg border border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-sm"
                >
                  Download CSV for this brief
                </a>
              )}
              <DraftsPanel
                briefId={selectedBriefId}
                drafts={drafts.filter((d) => d.status === "approved" || d.status === "draft")}
                draftEdits={draftEdits}
                setDraftEdits={setDraftEdits}
                draftBusyId={draftBusyId}
                onPatch={patchDraft}
                onRegenerate={regenerate}
                regenerateBusy={regenerateBusy}
              />
            </div>
          )}

          {tab === "setup" && (
            <SetupTab
              sources={sourceRows}
              youtubeConfigured={youtubeOk}
              redditConfigured={redditOk}
              redditPartial={!!data?.config?.reddit_partial_configured}
            />
          )}
        </>
      )}
    </main>
  );
}
