"use client";
import React from "react";
import Link from "next/link";

const GROUPS = [
  {
    label: "Mobile & Client Control",
    eli5:
      "Remote-control the mobile app from the website: turn features on/off and manage in-app update notes without shipping a new build.",
    links: [
      {
        href: "/admin/feature-flags",
        label: "Feature Flags",
        eli5: "Turn app features on/off without a new release.",
      },
      {
        href: "/admin/app-whats-new",
        label: "App What's New",
        eli5: "Manage update notes and popup content for mobile users.",
      },
      {
        href: "/admin/app-scanner",
        label: "Scanner analytics",
        eli5: "PostHog funnel and quality metrics for the mobile card scanner (OCR, AI assist, auto-add).",
      },
    ],
  },
  {
    label: "Users & Feedback",
    eli5: "Read what users say, manage accounts, and handle support requests.",
    links: [
      { href: "/admin/feedback-dashboard", label: "Feedback Dashboard", eli5: "Where feedback is collected, where it goes (Supabase vs PostHog), counts and links" },
      { href: "/admin/feedback", label: "Feedback", eli5: "Thumbs up/down and comments from the widget + chat" },
      { href: "/admin/ai-reports", label: "AI Reports", eli5: "Review and triage AI report submissions from chat" },
      { href: "/admin/app-ai-feedback", label: "App AI Feedback", eli5: "App-identified structured AI reports (chat corrections with app_* surface); honest limits for generic feedback" },
      { href: "/admin/support", label: "User Support", eli5: "Grant Pro, resend emails, GDPR export/delete" },
      { href: "/admin/shoutbox", label: "Shoutbox", eli5: "Moderate messages, ban users, trigger AI posts" },
    ],
  },
  {
    label: "AI & Chat",
    eli5: "Tune how the AI talks, test it, and see what it costs.",
    links: [
      { href: "/admin/ai-health", label: "AI Health", eli5: "Is the API key working? Run a live test" },
      { href: "/admin/ai-usage", label: "AI Usage", eli5: "Cost, tokens, which models are used" },
      { href: "/admin/ai-usage-app", label: "AI Usage (App)", eli5: "Mobile-only AI cost & tokens by app feature key" },
      { href: "/admin/route-health", label: "Route Health", eli5: "Admin API matrix, safe health checks, and live smoke tests" },
      { href: "/admin/prompt-edit", label: "Prompt Edit", eli5: "Edit base prompts (chat/deck) and tier overlays (guest/free/pro). Stored in DB." },
    ],
  },
  {
    label: "Money & Ops",
    eli5: "Stripe, cron jobs, deploy, and rollbacks.",
    links: [
      { href: "/admin/monetize", label: "Monetize", eli5: "Stripe sync, subscribers" },
      { href: "/admin/pro-gate", label: "Pro Gate", eli5: "Where users see the Pro paywall, conversion funnel" },
      { href: "/admin/ops", label: "Ops", eli5: "Run crons, edit config, rollback snapshots" },
      { href: "/admin/deploy", label: "Deploy", eli5: "Deploy and release info" },
      { href: "/admin/changelog", label: "Changelog", eli5: "Edit What's New entries (website)" },
      { href: "/admin/blog", label: "Blog", eli5: "Manage blog listing, art, excerpts on /blog" },
    ],
  },
  {
    label: "Data & Tools",
    eli5: "SEO pages, backups, and debug tools.",
    links: [
      { href: "/admin/datadashboard", label: "Data Dashboard", eli5: "Behaviour & meta data: suggestions accepted, deck snapshots, meta/commander history. Run tests, see counts." },
      { href: "/admin/budget-swaps", label: "Budget Swaps", eli5: "Manage Quick Swaps map; weekly cron adds AI suggestions" },
      { href: "/admin/precons", label: "Precons", eli5: "Sync Westly/CommanderPrecons from GitHub, insert one-off, or generate SQL" },
      { href: "/admin/seo/pages", label: "SEO Pages", eli5: "Manage SEO landing pages" },
      { href: "/admin/data", label: "Data", eli5: "Run bulk jobs, vacuum, snapshot" },
      { href: "/admin/analytics-seed", label: "Analytics Seed", eli5: "Seed or debug analytics data" },
      { href: "/admin/backups", label: "Backups", eli5: "Backup management" },
      { href: "/admin/obs", label: "OBS", eli5: "Audit log, rate limits, errors" },
      { href: "/admin/security", label: "Security", eli5: "Security checks" },
    ],
  },
  {
    label: "Mulligan",
    eli5: "Mulligan usage and stats.",
    links: [
      { href: "/admin/mulligan-analytics", label: "Mulligan Analytics", eli5: "Usage stats" },
    ],
  },
];

export default function AdminDashboardPage() {
  return (
    <main className="max-w-4xl mx-auto p-4 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-neutral-400">
            Grouped by purpose. Each section has an ELI5 (Explain Like I am 5) so you know what it does.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/JustForDavy/command-center"
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium text-sm"
          >
            Daily Command Center
          </Link>
          <Link
            href="/admin/JustForDavy/chat-debug"
            className="px-4 py-2 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-sm"
          >
            Chat debug (stream)
          </Link>
        </div>
      </div>
      {GROUPS.map((group) => (
        <section key={group.label} className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
          <h2 className="text-base font-semibold text-neutral-200 mb-1">{group.label}</h2>
          <p className="text-xs text-neutral-500 mb-3">{group.eli5}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {group.links.map(({ href, label, eli5 }) => (
              <Link
                key={href}
                href={href}
                className="block rounded-lg border border-neutral-700 bg-neutral-800/60 p-3 hover:bg-neutral-700/60 hover:border-neutral-600 transition-colors"
              >
                <div className="font-medium text-sm">{label}</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">{eli5}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
