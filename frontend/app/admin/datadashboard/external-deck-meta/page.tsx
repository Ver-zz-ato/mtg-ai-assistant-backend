"use client";

import React from "react";
import DataDashboardNav from "../DataDashboardNav";

type ProfileQa = {
  id: string;
  commander_name: string;
  raw_sample_size: number;
  approved_sample_size: number;
  excluded_count: number;
  exclusion_reasons: Record<string, number>;
  source_breakdown: Record<string, number>;
  common_cards?: Array<{ name: string; deck_count: number; inclusion_rate: number }>;
  missing_common_support?: Array<{ name: string; inclusion_rate?: number; deck_count?: number }>;
  confidence_components?: Record<string, unknown>;
  profile_consistency?: Record<string, unknown>;
  role_variance?: Record<string, unknown>;
  profile_warnings?: string[];
  off_color_support_gap_count?: number;
  averages?: {
    lands?: number;
    ramp?: number;
    draw?: number;
    removal?: number;
    protection?: number;
    average_mv?: number;
  };
  confidence_score: number;
  approved_for_public: boolean;
  attribution?: { copy?: string };
  last_refreshed_at: string;
  readiness_bucket?: string;
  suspicious_metrics?: string[];
};

type StatusData = {
  sources: Array<{
    source_key: string;
    display_name: string;
    enabled: boolean;
    discovery_enabled: boolean;
    cooldown_until: string | null;
    last_success_at: string | null;
    last_error: string | null;
    consecutive_failures: number;
  }>;
  queue_total: number;
  queue_by_status: Record<string, number>;
  decks_total: number;
  summary?: {
    total_external_decks: number;
    valid_commander_decks: number;
    excluded_decks: number;
    commander_profiles_generated: number;
  };
  decks_by_state: Record<string, number>;
  excluded_by_reason?: Record<string, number>;
  readiness_buckets?: Record<string, number>;
  suspicious_profiles?: Array<{
    commander_name: string;
    approved_sample_size: number;
    confidence_score: number;
    averages: ProfileQa["averages"];
    suspicious_metrics: string[];
  }>;
  deck_sanity_flags?: Array<{
    flag: string;
    source_key: string;
    external_id: string;
    format: string;
    mainboard_count: number;
    aggregate_approved: boolean;
    exclusion_reason: string | null;
  }>;
  coverage?: {
    top100: CoverageTarget[];
    top250: CoverageTarget[];
    top100_summary: CoverageSummary;
    top250_summary: CoverageSummary;
    community_profile_eligible_count: number;
    remaining_growth_opportunities: number;
  };
  last_allocator_summary?: {
    ok: boolean;
    mode: string;
    detail_fetch_cap: number;
    growth_budget: number;
    refresh_budget: number;
    queued_growth: number;
    queued_refresh: number;
    next_work_bucket: string;
    cooldown_until?: string | null;
    errors?: string[];
    ran_at: string;
    processed_summary?: {
      processed: number;
      insertedOrUpdated: number;
      unchanged: number;
      failed: number;
      errors: string[];
    } | null;
    coverage_before?: {
      top100: CoverageSummary;
      top250: CoverageSummary;
      community_profile_eligible_count: number;
    };
    coverage_after?: {
      top100: CoverageSummary;
      top250: CoverageSummary;
      community_profile_eligible_count: number;
    };
  } | null;
  profiles: ProfileQa[];
  top_profiles_by_confidence?: ProfileQa[];
  recently_refreshed_profiles?: ProfileQa[];
};

type CoverageSummary = {
  total: number;
  eligible: number;
  near_eligible: number;
  early_signal: number;
  not_ready: number;
  needs_confidence_review: number;
};

type CoverageTarget = {
  rank: number;
  commander: string;
  approved_sample_size: number;
  confidence_score: number;
  readiness_bucket: string;
  needed_to_50: number;
  community_profile_eligible: boolean;
  warnings: string[];
};

type ComparisonQaResult = {
  found: boolean;
  error?: string;
  commander?: string | null;
  commander_profile?: {
    raw_sample_size: number;
    approved_sample_size: number;
    confidence_score: number;
    comparison_confidence_score?: number;
    confidence_components?: Record<string, unknown>;
    profile_consistency?: Record<string, unknown>;
    role_variance?: Record<string, unknown>;
    profile_warnings?: string[];
    off_color_support_gap_count?: number;
    source_breakdown: Record<string, number>;
    exclusion_reasons: Record<string, number>;
    last_refreshed_at: string | null;
  };
  parsed_deck?: {
    card_count: number;
    quantity_count: number;
    cache_misses: string[];
  };
  your_deck?: Record<"lands" | "ramp" | "draw" | "removal" | "protection", number>;
  profile?: Record<"lands" | "ramp" | "draw" | "removal" | "protection", number>;
  delta?: Record<"lands" | "ramp" | "draw" | "removal" | "protection", number>;
  top_common_cards?: Array<{ name: string; deck_count: number; inclusion_rate: number }>;
  missing_common_cards?: Array<{ name: string; deck_count: number; inclusion_rate: number }>;
  support_gaps?: Array<{ name: string; inclusion_rate?: number; deck_count?: number }>;
};

function readinessLabel(key: string) {
  if (key === "eligible") return "Eligible";
  if (key === "needs_confidence_review") return "Needs confidence review";
  if (key === "not_ready") return "Not ready";
  if (key === "early_signal") return "Early signal";
  if (key === "usable_qa") return "Usable QA";
  if (key === "public_candidate") return "Public candidate";
  return key;
}

export default function ExternalDeckMetaPage() {
  const [data, setData] = React.useState<StatusData | null>(null);
  const [urls, setUrls] = React.useState("");
  const [compareCommander, setCompareCommander] = React.useState("");
  const [compareDeckText, setCompareDeckText] = React.useState("");
  const [comparison, setComparison] = React.useState<ComparisonQaResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    // eslint-disable-next-line no-restricted-globals -- Client admin page calls same-origin admin API.
    const res = await fetch("/api/admin/data/external-deck-meta/status", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load status");
    setData(json.data);
  }

  React.useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, []);

  async function postJson(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // eslint-disable-next-line no-restricted-globals -- Client admin page calls same-origin admin API.
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
      setMessage(JSON.stringify(json.result ?? json.summary ?? json.profile ?? json, null, 2));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runComparisonQa() {
    setBusy(true);
    setError(null);
    setMessage(null);
    setComparison(null);
    try {
      // eslint-disable-next-line no-restricted-globals -- Client admin page calls same-origin admin API.
      const res = await fetch("/api/admin/data/external-deck-meta/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commander: compareCommander || undefined, deckText: compareDeckText, qaMode: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Comparison failed");
      setComparison(json.result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const urlList = urls.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
  const summary = data?.summary ?? {
    total_external_decks: data?.decks_total ?? 0,
    valid_commander_decks: 0,
    excluded_decks: 0,
    commander_profiles_generated: data?.profiles.length ?? 0,
  };
  const readiness = data?.readiness_buckets ?? { not_ready: 0, early_signal: 0, usable_qa: 0, public_candidate: 0 };
  const coverage = data?.coverage;
  const allocator = data?.last_allocator_summary ?? null;
  const profileLists = [
    { title: "Top 25 by approved sample", rows: data?.profiles ?? [] },
    { title: "Top 25 by confidence", rows: data?.top_profiles_by_confidence ?? [] },
    { title: "Recently refreshed", rows: data?.recently_refreshed_profiles ?? [] },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">External Deck Meta</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Admin-only QA for public Moxfield/Archidekt deck ingestion. Nothing here powers public or mobile output yet.
        </p>
      </div>
      <DataDashboardNav />

      <section className="rounded border border-neutral-800 p-4 space-y-3">
        <h2 className="font-medium">Queue public deck URLs</h2>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={5}
          placeholder="https://archidekt.com/decks/123456&#10;https://moxfield.com/decks/abc123"
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || urlList.length === 0}
            onClick={() => postJson("/api/admin/data/external-deck-meta/queue", { urls: urlList })}
            className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-sm"
          >
            Queue URLs
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => postJson("/api/admin/data/external-deck-meta/run", { source: "all", limit: 10, discover: true })}
            className="px-4 py-2 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-sm"
          >
            Run ingest now
          </button>
        </div>
      </section>

      <section className="rounded border border-amber-900/60 bg-amber-950/10 p-4 space-y-3">
        <div>
          <h2 className="font-medium">Commander comparison QA mode</h2>
          <p className="text-xs text-neutral-500 mt-1">Admin-only local QA. This does not power public, mobile, or Deck Analysis output.</p>
        </div>
        <input
          value={compareCommander}
          onChange={(e) => setCompareCommander(e.target.value)}
          placeholder="Commander name, e.g. Korvold, Fae-Cursed King"
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
        />
        <textarea
          value={compareDeckText}
          onChange={(e) => setCompareDeckText(e.target.value)}
          rows={8}
          placeholder="Paste a Commander deck list here"
          className="w-full rounded bg-neutral-950 border border-neutral-700 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || compareDeckText.trim().length < 10}
          onClick={runComparisonQa}
          className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-sm"
        >
          Compare in QA mode
        </button>
        {comparison && (
          <div className="rounded bg-neutral-950 border border-neutral-800 p-3">
            {!comparison.found ? (
              <div className="text-sm text-amber-300">No commander profile found: {comparison.error ?? "unknown"}</div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <div className="font-medium">{comparison.commander}</div>
                    <div className="text-xs text-neutral-500">Last refreshed: {comparison.commander_profile?.last_refreshed_at ?? "never"}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-400">
                    <div>Raw sample: {comparison.commander_profile?.raw_sample_size ?? 0}</div>
                    <div>Approved sample: {comparison.commander_profile?.approved_sample_size ?? 0}</div>
                    <div>Confidence: {comparison.commander_profile?.confidence_score ?? 0}</div>
                    <div>Deck-match confidence: {comparison.commander_profile?.comparison_confidence_score ?? comparison.commander_profile?.confidence_score ?? 0}</div>
                    <div>Parsed cards: {comparison.parsed_deck?.quantity_count ?? 0}</div>
                    <div>Off-color support gaps: {comparison.commander_profile?.off_color_support_gap_count ?? 0}</div>
                  </div>
                </div>
                <pre className="text-xs text-neutral-500 bg-neutral-900 rounded p-2 overflow-auto">
                  {JSON.stringify(
                    {
                      confidence_components: comparison.commander_profile?.confidence_components ?? {},
                      profile_consistency: comparison.commander_profile?.profile_consistency ?? {},
                      role_variance: comparison.commander_profile?.role_variance ?? {},
                      warnings: comparison.commander_profile?.profile_warnings ?? [],
                    },
                    null,
                    2
                  )}
                </pre>
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-neutral-500">
                      <tr>
                        <th className="text-left py-1">Metric</th>
                        <th className="text-right py-1">Your deck</th>
                        <th className="text-right py-1">Profile</th>
                        <th className="text-right py-1">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["lands", "ramp", "draw", "removal", "protection"] as const).map((key) => {
                        const delta = comparison.delta?.[key] ?? 0;
                        return (
                          <tr key={key} className="border-t border-neutral-800">
                            <td className="py-1 capitalize">{key}</td>
                            <td className="py-1 text-right font-mono">{comparison.your_deck?.[key] ?? 0}</td>
                            <td className="py-1 text-right font-mono">{comparison.profile?.[key] ?? 0}</td>
                            <td className={delta < 0 ? "py-1 text-right font-mono text-red-300" : "py-1 text-right font-mono text-emerald-300"}>
                              {delta > 0 ? `+${delta}` : delta}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="text-sm font-medium">Top common cards</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(comparison.top_common_cards ?? []).slice(0, 15).map((card) => (
                      <span key={card.name} className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
                        {card.name} <span className="text-neutral-500">{Math.round(card.inclusion_rate * 100)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">Missing common cards</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(comparison.missing_common_cards ?? []).slice(0, 15).map((card) => (
                      <span key={card.name} className="rounded border border-amber-900 bg-amber-950/30 px-2 py-1 text-xs text-amber-200">
                        {card.name} <span className="text-amber-500">{Math.round(card.inclusion_rate * 100)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
                {Boolean(comparison.support_gaps?.length) && (
                  <div className="text-xs text-neutral-500">
                    Support gaps: {comparison.support_gaps?.slice(0, 10).map((card) => `${card.name}${card.inclusion_rate ? ` (${Math.round(card.inclusion_rate * 100)}%)` : ""}`).join(", ")}
                  </div>
                )}
                {Boolean(comparison.parsed_deck?.cache_misses.length) && (
                  <div className="text-xs text-amber-300">
                    Cache misses: {comparison.parsed_deck?.cache_misses.join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {error && <pre className="text-sm text-red-300 whitespace-pre-wrap">{error}</pre>}
      {message && <pre className="text-xs text-emerald-300 bg-neutral-950 border border-neutral-800 rounded p-3 overflow-auto">{message}</pre>}

      {data && (
        <>
          <section className="rounded border border-neutral-800 p-4">
            <h2 className="font-medium mb-3">Source health</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.sources.map((s) => (
                <div key={s.source_key} className="rounded bg-neutral-900 border border-neutral-800 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{s.display_name}</span>
                    <span className={s.enabled ? "text-emerald-300" : "text-red-300"}>{s.enabled ? "enabled" : "disabled"}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-2 space-y-1">
                    <div>Discovery: {s.discovery_enabled ? "on" : "off"}</div>
                    <div>Cooldown: {s.cooldown_until ?? "none"}</div>
                    <div>Last success: {s.last_success_at ?? "never"}</div>
                    <div>Failures: {s.consecutive_failures}</div>
                    {s.last_error && <div className="text-amber-300">Last error: {s.last_error}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded border border-neutral-800 p-4 text-sm">
            <h2 className="font-medium mb-3">Counts</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
                <div className="text-xs text-neutral-500">Total external decks</div>
                <div className="font-mono text-lg">{summary.total_external_decks}</div>
              </div>
              <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
                <div className="text-xs text-neutral-500">Valid Commander decks</div>
                <div className="font-mono text-lg text-emerald-300">{summary.valid_commander_decks}</div>
              </div>
              <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
                <div className="text-xs text-neutral-500">Excluded decks</div>
                <div className="font-mono text-lg text-amber-300">{summary.excluded_decks}</div>
              </div>
              <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
                <div className="text-xs text-neutral-500">Commander profiles</div>
                <div className="font-mono text-lg">{summary.commander_profiles_generated}</div>
              </div>
            </div>
            <pre className="mt-3 text-xs text-neutral-400 bg-neutral-950 rounded p-3 overflow-auto">
              {JSON.stringify(
                {
                  queue_total: data.queue_total,
                  queue_by_status: data.queue_by_status,
                  decks_by_state: data.decks_by_state,
                  excluded_by_reason: data.excluded_by_reason ?? {},
                },
                null,
                2
              )}
            </pre>
          </section>

          <section className="rounded border border-neutral-800 p-4">
            <h2 className="font-medium mb-3">Readiness buckets</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              {["not_ready", "early_signal", "usable_qa", "public_candidate"].map((key) => (
                <div key={key} className="rounded bg-neutral-900 border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-500">{readinessLabel(key)}</div>
                  <div className="font-mono text-lg">{readiness[key] ?? 0}</div>
                </div>
              ))}
            </div>
          </section>

          {coverage && (
            <section className="rounded border border-neutral-800 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium">Popularity coverage</h2>
                  <p className="text-xs text-neutral-500 mt-1">Admin-only target tracking. Ranking uses internal commander popularity; profile samples are joined from external QA data.</p>
                </div>
                <div className="text-xs text-neutral-400">
                  Eligible profiles: <span className="font-mono text-emerald-300">{coverage.community_profile_eligible_count}</span>
                  <span className="mx-2 text-neutral-700">/</span>
                  Target: <span className="font-mono">100</span>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 text-sm">
                {[
                  { label: "Top 100", summary: coverage.top100_summary },
                  { label: "Top 250", summary: coverage.top250_summary },
                ].map((item) => (
                  <div key={item.label} className="rounded bg-neutral-900 border border-neutral-800 p-3">
                    <div className="font-medium">{item.label}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                      <div>Eligible: <span className="font-mono text-emerald-300">{item.summary.eligible}</span></div>
                      <div>Near: <span className="font-mono">{item.summary.near_eligible}</span></div>
                      <div>Early: <span className="font-mono">{item.summary.early_signal}</span></div>
                      <div>Not ready: <span className="font-mono">{item.summary.not_ready}</span></div>
                      <div>Confidence review: <span className="font-mono">{item.summary.needs_confidence_review}</span></div>
                      <div>Total: <span className="font-mono">{item.summary.total}</span></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded bg-neutral-900 border border-neutral-800 p-3 text-xs text-neutral-400">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <div>Next cron work bucket: <span className="font-mono text-neutral-200">{allocator?.next_work_bucket ?? "unknown"}</span></div>
                  <div>Last run: <span className="font-mono">{allocator?.ran_at ? new Date(allocator.ran_at).toLocaleString() : "never"}</span></div>
                  <div>Queued growth/refresh: <span className="font-mono">{allocator ? `${allocator.queued_growth}/${allocator.queued_refresh}` : "0/0"}</span></div>
                  <div>Processed: <span className="font-mono">{allocator?.processed_summary?.processed ?? 0}</span></div>
                  <div>Remaining growth opportunities: <span className="font-mono">{coverage.remaining_growth_opportunities}</span></div>
                </div>
                {allocator?.cooldown_until && <div className="mt-2 text-amber-300">Cooldown until: {allocator.cooldown_until}</div>}
                {Boolean(allocator?.errors?.length) && <div className="mt-2 text-red-300">Errors: {allocator?.errors?.join(", ")}</div>}
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="text-left py-1">Rank</th>
                      <th className="text-left py-1">Commander</th>
                      <th className="text-right py-1">Approved</th>
                      <th className="text-right py-1">Confidence</th>
                      <th className="text-left py-1">Bucket</th>
                      <th className="text-right py-1">Need</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.top100.slice(0, 25).map((row) => (
                      <tr key={`${row.rank}-${row.commander}`} className="border-t border-neutral-800">
                        <td className="py-1 font-mono">{row.rank}</td>
                        <td className="py-1 text-neutral-200">{row.commander}</td>
                        <td className="py-1 text-right font-mono">{row.approved_sample_size}</td>
                        <td className="py-1 text-right font-mono">{row.confidence_score}</td>
                        <td className="py-1">{readinessLabel(row.readiness_bucket)}</td>
                        <td className="py-1 text-right font-mono">{row.needed_to_50}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded border border-neutral-800 p-4">
            <h2 className="font-medium mb-3">Sanity flags</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
                <div className="text-sm font-medium">Suspicious profile metrics</div>
                <div className="mt-2 space-y-2">
                  {(data.suspicious_profiles ?? []).length === 0 && <div className="text-xs text-neutral-500">No suspicious profile metrics in the visible QA set.</div>}
                  {(data.suspicious_profiles ?? []).slice(0, 8).map((p) => (
                    <div key={`${p.commander_name}-${p.suspicious_metrics.join(",")}`} className="text-xs text-neutral-400">
                      <span className="text-neutral-200">{p.commander_name}</span>: {p.suspicious_metrics.join(", ")}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded bg-neutral-900 border border-neutral-800 p-3">
                <div className="text-sm font-medium">Deck sanity flags</div>
                <div className="mt-2 space-y-2">
                  {(data.deck_sanity_flags ?? []).length === 0 && <div className="text-xs text-neutral-500">No deck sanity flags.</div>}
                  {(data.deck_sanity_flags ?? []).slice(0, 8).map((flag) => (
                    <div key={`${flag.source_key}-${flag.external_id}-${flag.flag}`} className="text-xs text-neutral-400">
                      <span className="text-neutral-200">{flag.flag}</span>: {flag.source_key}/{flag.external_id} ({flag.mainboard_count})
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {profileLists.map((list) => (
            <section key={list.title} className="rounded border border-neutral-800 p-4">
              <h2 className="font-medium mb-3">{list.title}</h2>
              <div className="space-y-3">
                {list.rows.length === 0 && <div className="text-sm text-neutral-500">No profiles yet.</div>}
                {list.rows.map((p) => (
                  <div key={`${list.title}-${p.id}`} className="rounded bg-neutral-900 border border-neutral-800 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{p.commander_name}</div>
                        <div className="text-xs text-neutral-500">{p.attribution?.copy ?? "No attribution copy yet."}</div>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => postJson(`/api/admin/data/external-deck-meta/profiles/${p.id}/approval`, { approved: !p.approved_for_public })}
                        className={`px-3 py-1.5 rounded text-xs ${p.approved_for_public ? "bg-red-800 hover:bg-red-700" : "bg-emerald-800 hover:bg-emerald-700"}`}
                      >
                        {p.approved_for_public ? "Unapprove" : "Approve QA"}
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4 text-xs text-neutral-400 mt-3">
                      <div>Bucket: {readinessLabel(p.readiness_bucket ?? "not_ready")}</div>
                      <div>Raw: {p.raw_sample_size}</div>
                      <div>Approved sample: {p.approved_sample_size}</div>
                      <div>Excluded: {p.excluded_count}</div>
                      <div>Confidence: {p.confidence_score}</div>
                      <div>Public: {p.approved_for_public ? "approved" : "not approved"}</div>
                      <div>Last refreshed: {p.last_refreshed_at ? new Date(p.last_refreshed_at).toLocaleString() : "never"}</div>
                      <div>Avg lands: {p.averages?.lands ?? 0}</div>
                      <div>Avg ramp: {p.averages?.ramp ?? 0}</div>
                      <div>Avg draw: {p.averages?.draw ?? 0}</div>
                      <div>Avg removal: {p.averages?.removal ?? 0}</div>
                      <div>Avg protection: {p.averages?.protection ?? 0}</div>
                      <div>Off-color support gaps: {p.off_color_support_gap_count ?? 0}</div>
                    </div>
                    {Boolean(p.suspicious_metrics?.length || p.profile_warnings?.length) && (
                      <div className="mt-3 text-xs text-amber-300">
                        Flags: {[...(p.suspicious_metrics ?? []), ...(p.profile_warnings ?? [])].join(", ")}
                      </div>
                    )}
                    {Boolean(p.common_cards?.length) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.common_cards?.slice(0, 10).map((card) => (
                          <span key={card.name} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-300">
                            {card.name} <span className="text-neutral-500">{Math.round(card.inclusion_rate * 100)}%</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {Boolean(p.missing_common_support?.length) && (
                      <div className="mt-2 text-xs text-neutral-500">
                        Profile support candidates: {p.missing_common_support?.slice(0, 8).map((card) => `${card.name}${card.inclusion_rate ? ` (${Math.round(card.inclusion_rate * 100)}%)` : ""}`).join(", ")}
                      </div>
                    )}
                    <pre className="mt-2 text-xs text-neutral-500 bg-neutral-950 rounded p-2 overflow-auto">
                      {JSON.stringify(
                        {
                          sources: p.source_breakdown,
                          exclusions: p.exclusion_reasons,
                          confidence_components: p.confidence_components ?? {},
                          consistency: p.profile_consistency ?? {},
                          role_variance: p.role_variance ?? {},
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
