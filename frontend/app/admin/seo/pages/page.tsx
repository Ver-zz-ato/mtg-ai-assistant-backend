"use client";

import React from "react";
import Link from "next/link";

type SeoPage = {
  id: string;
  slug: string;
  title: string;
  template: string;
  query: string;
  priority: number;
  status: string;
  commander_slug: string | null;
  card_name: string | null;
  created_at: string;
  quality_score?: number;
  indexing?: string;
  impressions?: number | null;
  clicks?: number | null;
};

export default function SeoPagesAdminPage() {
  const [pages, setPages] = React.useState<SeoPage[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState<string>("priority_desc");
  const [joinMetrics, setJoinMetrics] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [winners, setWinners] = React.useState<Array<{ slug: string; title: string; impressions: number; clicks: number; ctr: number | null; position: number | null; priority: number }>>([]);
  const [winnersLoading, setWinnersLoading] = React.useState(false);

  const loadWinners = React.useCallback(async () => {
    setWinnersLoading(true);
    try {
      const r = await fetch("/api/admin/seo-pages/winners?threshold=10&limit=50", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setWinners(j.winners ?? []);
    } catch {
      setWinners([]);
    } finally {
      setWinnersLoading(false);
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (joinMetrics) params.set("join", "metrics");
      params.set("sort", sortBy);
      const url = `/api/admin/seo-pages/list?${params.toString()}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setPages(j.pages ?? []);
      else setMsg(j?.error ?? "Failed to load");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sortBy, joinMetrics]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    loadWinners();
  }, [loadWinners]);

  async function toggleStatus(slug: string, newStatus: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/seo-pages/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, status: newStatus }),
      });
      const j = await r.json();
      if (j?.ok) {
        setPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, status: newStatus } : p)));
        setMsg(`Updated ${slug} to ${newStatus}`);
      } else setMsg(j?.error ?? "Toggle failed");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/seo-pages/generate", { method: "POST" });
      const j = await r.json();
      if (j?.ok) {
        setMsg(`Generated ${j.generated ?? 0} candidates`);
        load();
      } else setMsg(j?.error ?? "Generate failed");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish(limit = 25) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/seo-pages/publish?limit=${limit}&minQuality=1`, { method: "POST" });
      const j = await r.json();
      if (j?.ok) {
        setMsg(`Published ${j.published ?? 0} pages`);
        load();
      } else setMsg(j?.error ?? "Publish failed");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setIndexing(slug: string, indexing: "index" | "noindex") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/seo-pages/set-indexing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, indexing }),
      });
      const j = await r.json();
      if (j?.ok) {
        setPages((prev) => prev.map((p) => (p.slug === slug ? { ...p, indexing } : p)));
        setWinners((prev) => prev.filter((w) => w.slug !== slug));
        setMsg(`Set ${slug} to ${indexing}`);
      } else setMsg(j?.error ?? "Set indexing failed");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">SEO Landing Pages</h1>
        <Link href="/admin" className="text-sm text-neutral-400 hover:text-white">
          ← Admin
        </Link>
      </div>

      <p className="text-sm text-neutral-400">
        Manage GSC-driven landing pages at /q/[slug]. Ingest queries via script, generate candidates, and publish.
      </p>

      {msg && (
        <div className="rounded border border-neutral-700 bg-neutral-900/50 px-4 py-2 text-sm text-neutral-200">
          {msg}
        </div>
      )}

      {/* SEO Winners */}
      <section className="rounded border border-emerald-900/50 bg-emerald-950/20 p-4 space-y-3">
        <div className="font-medium text-emerald-200">SEO Winners (Eligible for Indexing)</div>
        <p className="text-xs text-neutral-400">Pages here are receiving impressions but are still noindex.</p>
        {winnersLoading ? (
          <div className="text-sm text-neutral-500">Loading…</div>
        ) : winners.length === 0 ? (
          <div className="text-sm text-neutral-500">No noindex pages with impressions above threshold.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-700">
                  <th className="text-left p-2">Slug</th>
                  <th className="text-left p-2 tabular-nums">Impressions</th>
                  <th className="text-left p-2 tabular-nums">Clicks</th>
                  <th className="text-left p-2 tabular-nums">CTR</th>
                  <th className="text-left p-2 tabular-nums">Position</th>
                  <th className="text-left p-2">Priority</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w) => (
                  <tr key={w.slug} className="border-b border-neutral-800">
                    <td className="p-2">
                      <a href={`/q/${w.slug}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                        {w.slug}
                      </a>
                    </td>
                    <td className="p-2 tabular-nums">{w.impressions}</td>
                    <td className="p-2 tabular-nums">{w.clicks}</td>
                    <td className="p-2 tabular-nums">{w.ctr != null ? `${(w.ctr * 100).toFixed(2)}%` : "—"}</td>
                    <td className="p-2 tabular-nums">{w.position ?? "—"}</td>
                    <td className="p-2 tabular-nums">{w.priority}</td>
                    <td className="p-2">
                      <button
                        onClick={() => setIndexing(w.slug, "index")}
                        disabled={busy}
                        className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60"
                      >
                        Index
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <button onClick={generate} disabled={busy} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm">
          Generate from queries
        </button>
        <button onClick={() => publish(25)} disabled={busy} className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:opacity-60 text-sm">
          Publish top 25
        </button>
        <button onClick={() => publish(200)} disabled={busy} className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 disabled:opacity-60 text-sm">
          Publish all qualifying
        </button>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm"
        >
          <option value="priority_desc">Sort by priority</option>
          <option value="impressions_desc">Sort by impressions (high)</option>
          <option value="impressions_asc">Sort by impressions (low)</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={joinMetrics} onChange={(e) => setJoinMetrics(e.target.checked)} className="rounded" />
          Include metrics
        </label>
      </div>

      <div className="rounded border border-neutral-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-neutral-400">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-900 border-b border-neutral-700">
                <th className="text-left p-3">Slug</th>
                <th className="text-left p-3">Template</th>
                <th className="text-left p-3">Query</th>
                <th className="text-left p-3">Priority</th>
                <th className="text-left p-3 tabular-nums">Quality</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Indexing</th>
                {joinMetrics && (
                  <>
                    <th className="text-left p-3 tabular-nums">Impressions</th>
                    <th className="text-left p-3 tabular-nums">Clicks</th>
                  </>
                )}
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-neutral-800">
                  <td className="p-3">
                    <a href={`/q/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                      {p.slug}
                    </a>
                  </td>
                  <td className="p-3 text-neutral-300">{p.template}</td>
                  <td className="p-3 text-neutral-400 max-w-[200px] truncate" title={p.query}>
                    {p.query}
                  </td>
                  <td className="p-3 tabular-nums">{p.priority}</td>
                  <td className="p-3 tabular-nums">{p.quality_score ?? "—"}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${p.status === "published" ? "bg-green-900/50 text-green-300" : p.status === "draft" ? "bg-amber-900/50 text-amber-300" : "bg-neutral-700 text-neutral-300"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.status === "published" ? (
                      <button
                        onClick={() => setIndexing(p.slug, (p.indexing ?? "noindex") === "index" ? "noindex" : "index")}
                        disabled={busy}
                        className={`text-xs ${(p.indexing ?? "noindex") === "index" ? "text-green-400" : "text-neutral-500"} hover:underline`}
                        title={(p.indexing ?? "noindex") === "index" ? "Click to set noindex" : "Click to set index (include in sitemap)"}
                      >
                        {p.indexing ?? "noindex"}
                      </button>
                    ) : (
                      <span className="text-neutral-500 text-xs">{p.indexing ?? "noindex"}</span>
                    )}
                  </td>
                  {joinMetrics && (
                    <>
                      <td className="p-3 tabular-nums text-neutral-400">{p.impressions ?? "—"}</td>
                      <td className="p-3 tabular-nums text-neutral-400">{p.clicks ?? "—"}</td>
                    </>
                  )}
                  <td className="p-3">
                    {p.status === "draft" && (
                      <button onClick={() => toggleStatus(p.slug, "published")} disabled={busy} className="text-green-400 hover:underline text-xs mr-2">
                        Publish
                      </button>
                    )}
                    {p.status === "published" && (
                      <button onClick={() => toggleStatus(p.slug, "disabled")} disabled={busy} className="text-amber-400 hover:underline text-xs mr-2">
                        Disable
                      </button>
                    )}
                    {p.status === "disabled" && (
                      <button onClick={() => toggleStatus(p.slug, "draft")} disabled={busy} className="text-blue-400 hover:underline text-xs">
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && pages.length === 0 && (
        <p className="text-sm text-neutral-500">
          No pages. Run the ingest script with your GSC export, then click &quot;Generate from queries&quot;.
        </p>
      )}
    </div>
  );
}
