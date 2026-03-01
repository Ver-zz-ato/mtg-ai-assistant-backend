"use client";
import React from "react";
import Link from "next/link";

const GROUPS = [
  {
    label: "Users & Feedback",
    eli5: "Read what users say, manage accounts, and handle support requests.",
    links: [
      { href: "/admin/feedback", label: "Feedback", eli5: "Thumbs up/down and comments from the widget + chat" },
      { href: "/admin/support", label: "User Support", eli5: "Grant Pro, resend emails, GDPR export/delete" },
      { href: "/admin/users", label: "User Search", eli5: "Find users by email or ID" },
    ],
  },
  {
    label: "AI & Chat",
    eli5: "Tune how the AI talks, test it, and see what it costs.",
    links: [
      { href: "/admin/ai-health", label: "AI Health", eli5: "Is the API key working? Run a live test" },
      { href: "/admin/ai-usage", label: "AI Usage", eli5: "Cost, tokens, which models are used" },
      { href: "/admin/ai", label: "AI & Chat", eli5: "Prompts, personas, moderation lists" },
      { href: "/admin/ai-test", label: "AI Test Suite", eli5: "Run evals, compare prompts, approve changes" },
    ],
  },
  {
    label: "Money & Ops",
    eli5: "Stripe, pricing, cron jobs, and rollbacks.",
    links: [
      { href: "/admin/monetize", label: "Monetize", eli5: "Stripe sync, subscribers" },
      { href: "/admin/pricing", label: "Pricing", eli5: "Pricing analytics" },
      { href: "/admin/pro-gate", label: "Pro Gate", eli5: "Where users see the Pro paywall, conversion funnel" },
      { href: "/admin/billing-forensics", label: "Billing Forensics", eli5: "Why is Vercel charging us? Find cost drivers" },
      { href: "/admin/ops", label: "Ops", eli5: "Run crons, edit config, rollback snapshots" },
      { href: "/admin/changelog", label: "Changelog", eli5: "Edit What's New entries" },
    ],
  },
  {
    label: "Data & Tools",
    eli5: "Import decks, SEO pages, backups, and debug tools.",
    links: [
      { href: "/admin/decks/import", label: "Decks Import", eli5: "Bulk import decks from URLs" },
      { href: "/admin/seo/pages", label: "SEO Pages", eli5: "Manage SEO landing pages" },
      { href: "/admin/data", label: "Data", eli5: "Run bulk jobs, vacuum, snapshot" },
      { href: "/admin/backups", label: "Backups", eli5: "Backup management" },
      { href: "/admin/obs", label: "OBS", eli5: "Audit log, rate limits, errors" },
      { href: "/admin/analytics-debug", label: "Analytics Debug", eli5: "Event debug" },
      { href: "/admin/attribution", label: "Attribution", eli5: "Funnel analytics" },
      { href: "/admin/events", label: "Events", eli5: "Probability & mulligan stats" },
      { href: "/admin/badges", label: "Badges", eli5: "Badge config" },
      { href: "/admin/chat-levers", label: "Chat Levers", eli5: "Chat config" },
      { href: "/admin/security", label: "Security", eli5: "Security checks" },
    ],
  },
  {
    label: "Mulligan",
    eli5: "Play with the mulligan AI and see stats.",
    links: [
      { href: "/admin/mulligan-ai", label: "Mulligan AI", eli5: "Test the mulligan simulator" },
      { href: "/admin/mulligan-analytics", label: "Mulligan Analytics", eli5: "Usage stats" },
    ],
  },
];

export default function AdminDashboardPage() {
  return (
    <main className="max-w-4xl mx-auto p-4 space-y-8">
      <h1 className="text-xl font-semibold">Admin Dashboard</h1>
      <p className="text-sm text-neutral-400">
        Grouped by purpose. Each section has an ELI5 (Explain Like I'm 5) so you know what it does.
      </p>
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
