'use client';
import React from 'react';
import Link from 'next/link';

function Pill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm">
      {children}
    </Link>
  );
}

export default function AdminHub() {
  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="space-y-1">
        <div className="text-xl font-semibold">Admin • JustForDavy</div>
        <p className="text-sm opacity-80">Central hub for Ops, Data, AI quality, Observability and Growth toggles.</p>
      </header>

      <nav className="flex flex-wrap gap-2">
        <Pill href="/admin/ops">Ops & Safety</Pill>
        <Pill href="/admin/data">Data & Pricing</Pill>
        <Pill href="/admin/ai">AI & Chat Quality</Pill>
        <Pill href="/admin/support">User Support</Pill>
        <Pill href="/admin/obs">Observability</Pill>
        <Pill href="/admin/monetize">Monetization</Pill>
        <Pill href="/admin/security">Security & Compliance</Pill>
        <Pill href="/admin/backups">Database Backups</Pill>
        <Pill href="/admin/deploy">Deployment Awareness</Pill>
        <Pill href="/admin/chat-levers">Chat Levers</Pill>
      </nav>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/ops" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Ops & Safety</div>
          <p className="text-sm opacity-80">Feature flags, kill switches, maintenance mode, budget caps, snapshot rollback.</p>
        </Link>
        <Link href="/admin/data" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Data & Pricing</div>
          <p className="text-sm opacity-80">Scryfall cache inspector, bulk jobs monitor, price delta heatmap.</p>
        </Link>
        <Link href="/admin/ai" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">AI & Chat Quality</div>
          <p className="text-sm opacity-80">Prompt library, metrics board, knowledge gaps, canned packs, moderation, evals.</p>
        </Link>
        <Link href="/admin/support" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">User Support</div>
          <p className="text-sm opacity-80">Lookup & impersonate (read‑only), account actions, GDPR helpers.</p>
        </Link>
        <Link href="/admin/obs" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Observability</div>
          <p className="text-sm opacity-80">Live event stream, 429 dashboard, error triage, RLS probe.</p>
        </Link>
        <Link href="/admin/monetize" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Monetization & Growth</div>
          <p className="text-sm opacity-80">Toggles for Stripe/Ko‑fi/PayPal, conversion funnel, promo bar.</p>
        </Link>
        <Link href="/admin/security" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Security & Compliance</div>
          <p className="text-sm opacity-80">Admin audit log, CSP tester, key rotation health.</p>
        </Link>
        <Link href="/admin/backups" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Database Backups</div>
          <p className="text-sm opacity-80">Backup status, manual triggers, restore testing, recovery procedures.</p>
        </Link>
        <Link href="/admin/deploy" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Deployment Awareness</div>
          <p className="text-sm opacity-80">Version & env panel, perf budgets roadmap.</p>
        </Link>
        <Link href="/admin/chat-levers" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Chat Levers</div>
          <p className="text-sm opacity-80">Defaults editor, answer‑packs switchboard, rules source tuning, model/cost policy.</p>
        </Link>
        <Link href="/admin/badges" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Badges</div>
          <p className="text-sm opacity-80">Rough counts & progress sampling for badges.</p>
        </Link>
        <Link href="/admin/events" className="rounded border border-neutral-800 p-3 hover:bg-neutral-900">
          <div className="font-medium mb-1">Events Debug</div>
          <p className="text-sm opacity-80">Tool usage counters summary (Probability runs, Mulligan iterations).</p>
        </Link>
      </section>
    </div>
  );
}