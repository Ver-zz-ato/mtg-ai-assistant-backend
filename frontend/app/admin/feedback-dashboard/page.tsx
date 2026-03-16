"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  ok: boolean;
  feedbackTotal?: number;
  aiReportsTotal?: number;
  aiReportsBySource?: Record<string, number>;
  error?: string;
};

const SOURCES = [
  {
    name: "Floating feedback button (FeedbackFab)",
    where: "Bottom-left “Feedback” on most pages",
    stored: "Supabase `feedback` table + PostHog event `feedback_sent` (optional property: source)",
    triggers: "button_click, founder_popup, frustration_prompt, deck_analysis",
    adminLink: "/admin/feedback",
  },
  {
    name: "Deck analysis “Was this useful?”",
    where: "Below analysis result (homepage DeckSnapshotPanel, deck page DeckAnalyzerPanel)",
    stored: "PostHog only: `analysis_feedback_submitted` (rating, feature, deck_id, score, prompt_version)",
    triggers: "After deck_analyzed",
    adminLink: null,
  },
  {
    name: "“Report bad suggestion” (Deck Analyzer)",
    where: "Deck page → Analyze → Report next to a suggestion",
    stored: "Supabase `ai_response_reports` (context_jsonb.source = deck_analyzer_suggestion) + PostHog `suggestion_report_submitted`",
    triggers: "Deck Analyzer suggestions",
    adminLink: "/admin/ai-reports",
  },
  {
    name: "Chat “Report issue” (🚩)",
    where: "Chat message → flag icon → issue type + description",
    stored: "Supabase `ai_response_reports` (thread_id, message_id; no context_jsonb.source) + PostHog (if wired)",
    triggers: "Any chat message",
    adminLink: "/admin/ai-reports",
  },
  {
    name: "Founder popup / Frustration prompt",
    where: "One-time founder message or “Something not working?” after frustration",
    stored: "Opens FeedbackFab → same as Floating feedback (source=founder_popup or frustration_prompt). PostHog: founder_popup_*, feedback_prompt_shown, user_frustrated",
    triggers: "Timer or frustration detection",
    adminLink: "/admin/feedback",
  },
] as const;

export default function AdminFeedbackDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/feedback-dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats({ ok: false, error: "Failed to load" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <Link
          href="/admin/justfordavy"
          className="text-sm text-neutral-400 hover:text-white mb-2 inline-block"
        >
          ← Admin
        </Link>
        <h1 className="text-xl font-semibold">Feedback Dashboard</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Where feedback is collected and where it goes (Supabase vs PostHog).
        </p>
      </div>

      {/* Counts */}
      <section className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-300 mb-3">
          Stored feedback (Supabase)
        </h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading counts…</p>
        ) : stats?.ok ? (
          <div className="flex flex-wrap gap-6">
            <div>
              <span className="text-2xl font-semibold text-white">
                {stats.feedbackTotal ?? 0}
              </span>
              <span className="text-sm text-neutral-500 ml-2">
                general feedback (rating + text)
              </span>
              <br />
              <Link
                href="/admin/feedback"
                className="text-xs text-blue-400 hover:underline"
              >
                View list →
              </Link>
            </div>
            <div>
              <span className="text-2xl font-semibold text-white">
                {stats.aiReportsTotal ?? 0}
              </span>
              <span className="text-sm text-neutral-500 ml-2">
                AI reports (chat + suggestion)
              </span>
              {stats.aiReportsBySource &&
                Object.keys(stats.aiReportsBySource).length > 0 && (
                  <div className="text-xs text-neutral-500 mt-1">
                    By source (sample of latest 1k):{" "}
                    {Object.entries(stats.aiReportsBySource).map(
                      ([source, count]) => (
                        <span key={source} className="mr-3">
                          {source}: {count}
                        </span>
                      )
                    )}
                  </div>
                )}
              <br />
              <Link
                href="/admin/ai-reports"
                className="text-xs text-blue-400 hover:underline"
              >
                View list →
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-red-400">
            {stats?.error ?? "Could not load counts"}
          </p>
        )}
      </section>

      {/* Where collected */}
      <section className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-300 mb-3">
          Where feedback is collected
        </h2>
        <ul className="space-y-4">
          {SOURCES.map((s) => (
            <li
              key={s.name}
              className="border-l-2 border-neutral-600 pl-3 py-1"
            >
              <div className="font-medium text-sm text-white">{s.name}</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                <span className="text-neutral-400">Where:</span> {s.where}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                <span className="text-neutral-400">Stored:</span> {s.stored}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                <span className="text-neutral-400">Triggers:</span> {s.triggers}
              </div>
              {s.adminLink && (
                <Link
                  href={s.adminLink}
                  className="text-xs text-blue-400 hover:underline mt-1 inline-block"
                >
                  View in admin →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-4 text-sm text-neutral-400">
        <strong className="text-neutral-300">PostHog</strong> holds event-level
        data: <code className="text-neutral-500">feedback_sent</code>,{" "}
        <code className="text-neutral-500">analysis_feedback_submitted</code>,{" "}
        <code className="text-neutral-500">suggestion_report_submitted</code>,{" "}
        <code className="text-neutral-500">feedback_widget_opened</code>,{" "}
        <code className="text-neutral-500">founder_popup_*</code>,{" "}
        <code className="text-neutral-500">user_frustrated</code>. Use PostHog
        dashboards for trends, funnels, and breakdowns by source or feature. See{" "}
        <code className="text-neutral-500">docs/POSTHOG_FEEDBACK_DASHBOARDS_SPEC.md</code>{" "}
        for event inventory and dashboard specs.
      </section>
    </main>
  );
}
