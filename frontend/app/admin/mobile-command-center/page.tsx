"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Bug,
  CreditCard,
  Database,
  Gauge,
  LineChart,
  MessageSquareWarning,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Users,
} from "lucide-react";

type Severity = "ok" | "info" | "warn" | "critical";
type Payload = {
  ok?: boolean;
  generatedAt?: string;
  days?: number;
  env?: Record<string, boolean>;
  metrics?: Array<{ key: string; label: string; value: string | number | null; sub?: string; severity?: Severity; href?: string }>;
  alerts?: Array<{ key: string; title: string; detail: string; severity: Severity; source: string; href?: string }>;
  rows?: Array<Record<string, unknown>>;
  tables?: Record<string, Array<Record<string, unknown>>>;
  notes?: string[];
  refresh?: Record<string, unknown>;
  error?: string;
};

type TabKey =
  | "overview"
  | "ai"
  | "users"
  | "analytics"
  | "revenue"
  | "errors"
  | "security"
  | "feedback"
  | "ops";

const TABS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "ai", label: "AI & Cost", icon: Bot },
  { key: "users", label: "Users", icon: Users },
  { key: "analytics", label: "Analytics", icon: LineChart },
  { key: "revenue", label: "Revenue", icon: CreditCard },
  { key: "errors", label: "Errors", icon: Bug },
  { key: "security", label: "Security", icon: ShieldAlert },
  { key: "feedback", label: "Feedback", icon: MessageSquareWarning },
  { key: "ops", label: "Ops & Data", icon: Database },
];

const ADMIN_LINKS = [
  { href: "/admin/ai-usage-app", label: "App AI usage" },
  { href: "/admin/app-ai-feedback", label: "App AI feedback" },
  { href: "/admin/feedback-dashboard", label: "Feedback triage" },
  { href: "/admin/app-scanner", label: "Scanner analytics" },
  { href: "/admin/feature-flags", label: "Feature flags" },
  { href: "/admin/app-whats-new", label: "App notes" },
  { href: "/admin/monetize", label: "Stripe/Pro" },
  { href: "/admin/ops", label: "Ops jobs" },
  { href: "/admin/security", label: "Security" },
  { href: "/admin/entitlements/debug", label: "Entitlements debug" },
];

function severityClass(severity: Severity = "info") {
  if (severity === "critical") return "border-red-700/80 bg-red-950/30 text-red-100";
  if (severity === "warn") return "border-amber-600/80 bg-amber-950/30 text-amber-100";
  if (severity === "ok") return "border-emerald-700/70 bg-emerald-950/20 text-emerald-100";
  return "border-sky-700/60 bg-sky-950/20 text-sky-100";
}

function queryString(days: number) {
  const qs = new URLSearchParams();
  qs.set("days", String(days));
  return qs.toString();
}

function asDisplay(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function MetricGrid({ metrics }: { metrics?: Payload["metrics"] }) {
  if (!metrics?.length) return <div className="text-sm text-neutral-500">No metrics returned.</div>;
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
      {metrics.map((metric) => {
        const body = (
          <div className={`min-h-[96px] rounded-lg border p-3 ${severityClass(metric.severity)}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-75">{metric.label}</div>
            <div className="mt-2 text-xl font-semibold tabular-nums break-words">{asDisplay(metric.value)}</div>
            {metric.sub ? <div className="mt-1 text-xs opacity-75">{metric.sub}</div> : null}
          </div>
        );
        return metric.href ? (
          <Link key={metric.key} href={metric.href} className="block hover:brightness-110">
            {body}
          </Link>
        ) : (
          <div key={metric.key}>{body}</div>
        );
      })}
    </section>
  );
}

function AlertList({ alerts }: { alerts?: Payload["alerts"] }) {
  if (!alerts?.length) return <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-sm text-emerald-100">No urgent launch alerts.</div>;
  return (
    <section className="space-y-2">
      {alerts.map((alert) => {
        const content = (
          <div className={`rounded-lg border p-3 ${severityClass(alert.severity)}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="text-sm font-semibold">{alert.title}</div>
                <div className="text-xs opacity-80">{alert.detail}</div>
              </div>
            </div>
          </div>
        );
        return alert.href ? (
          <Link key={`${alert.source}:${alert.key}`} href={alert.href} className="block hover:brightness-110">
            {content}
          </Link>
        ) : (
          <div key={`${alert.source}:${alert.key}`}>{content}</div>
        );
      })}
    </section>
  );
}

function DataTable({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  const columns = React.useMemo(() => {
    const set = new Set<string>();
    rows.slice(0, 20).forEach((row) => Object.keys(row).forEach((key) => set.add(key)));
    return Array.from(set).slice(0, 8);
  }, [rows]);
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/70 overflow-hidden">
      <div className="border-b border-neutral-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
      </div>
      {!rows.length || !columns.length ? (
        <div className="p-3 text-sm text-neutral-500">No rows.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 30).map((row, index) => (
                <tr key={index} className="border-t border-neutral-900/90 hover:bg-neutral-900/55">
                  {columns.map((column) => (
                    <td key={column} className="max-w-[260px] px-3 py-2 align-top text-neutral-300">
                      <span className="line-clamp-3 break-words">{asDisplay(row[column])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EnvStrip({ env }: { env?: Record<string, boolean> }) {
  const items = [
    ["Supabase", env?.serviceRoleConfigured],
    ["PostHog", env?.posthogConfigured],
    ["Sentry", env?.sentryConfigured],
    ["RevenueCat", env?.revenueCatConfigured],
    ["Discord", env?.discordWebhookConfigured],
  ] as const;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map(([label, ok]) => (
        <span
          key={label}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${
            ok ? "border-emerald-700/70 bg-emerald-950/25 text-emerald-100" : "border-amber-700/70 bg-amber-950/25 text-amber-100"
          }`}
        >
          {label}: {ok ? "on" : "missing"}
        </span>
      ))}
    </div>
  );
}

export default function MobileCommandCenterPage() {
  const [active, setActive] = React.useState<TabKey>("overview");
  const [days, setDays] = React.useState(7);
  const [payloads, setPayloads] = React.useState<Partial<Record<TabKey, Payload>>>({});
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const payload = payloads[active];

  async function load(tab: TabKey, nextDays = days) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mobile-command-center/${tab}?${queryString(nextDays)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Payload;
      setPayloads((prev) => ({ ...prev, [tab]: json }));
    } finally {
      setLoading(false);
    }
  }

  async function refreshRollups(sendDiscord = false) {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/mobile-command-center/refresh-rollups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, sendDiscord }),
      });
      const json = (await res.json().catch(() => ({}))) as Payload;
      setPayloads((prev) => ({ ...prev, overview: json }));
      setActive("overview");
    } finally {
      setRefreshing(false);
    }
  }

  React.useEffect(() => {
    load(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, days]);

  const tables = payload?.tables || {};

  return (
    <main className="min-h-screen bg-[#080807] text-neutral-100">
      <div className="mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-6 space-y-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-700/50 bg-amber-950/20 px-3 py-1 text-xs text-amber-100">
              <Smartphone className="h-3.5 w-3.5" />
              Website-only mobile launch admin
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">Mobile Command Center</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Launch health, AI spend, signups, revenue, Sentry, rate limits, feedback, and ops rollups.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            >
              {[1, 3, 7, 14, 30, 60, 90].map((value) => (
                <option key={value} value={value}>
                  {value} days
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => load(active)}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => refreshRollups(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-100 hover:bg-amber-900/30"
            >
              <Database className={`h-4 w-4 ${refreshing ? "animate-pulse" : ""}`} />
              Rollups
            </button>
          </div>
        </header>

        <nav className="sticky top-0 z-20 -mx-3 border-y border-neutral-800 bg-[#080807]/95 px-3 py-2 backdrop-blur md:mx-0 md:rounded-lg md:border">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const selected = tab.key === active;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm ${
                    selected ? "bg-amber-500 text-black" : "text-neutral-300 hover:bg-neutral-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        <EnvStrip env={payload?.env} />

        {payload?.error ? (
          <div className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-100">{payload.error}</div>
        ) : null}

        <MetricGrid metrics={payload?.metrics} />

        {active === "overview" ? <AlertList alerts={payload?.alerts} /> : null}

        {payload?.notes?.length ? (
          <section className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-sm text-neutral-300">
            {payload.notes.map((note) => (
              <div key={note}>{note}</div>
            ))}
          </section>
        ) : null}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {ADMIN_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-200 hover:border-amber-700/70 hover:text-amber-100"
            >
              {link.label}
            </Link>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {Object.entries(tables).map(([title, rows]) => (
            <DataTable key={title} title={title} rows={rows || []} />
          ))}
          {payload?.rows?.length ? <DataTable title="Rows" rows={payload.rows} /> : null}
        </section>

        <footer className="pb-8 text-xs text-neutral-500">
          {payload?.generatedAt ? `Updated ${new Date(payload.generatedAt).toLocaleString()}` : "Loading..."}.
          Service-role and vendor data stays server-side; list views are masked by default.
        </footer>
      </div>
    </main>
  );
}
