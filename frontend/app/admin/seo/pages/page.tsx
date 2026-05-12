"use client";

import React from "react";
import Link from "next/link";
import JSZip from "jszip";

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
  ctr?: number | null;
  position?: number | null;
};

export default function SeoPagesAdminPage() {
  const [pages, setPages] = React.useState<SeoPage[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState<string>("impact_desc");
  const [joinMetrics, setJoinMetrics] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [winners, setWinners] = React.useState<Array<{ slug: string; title: string; impressions: number; clicks: number; ctr: number | null; position: number | null; priority: number; is_legacy?: boolean }>>([]);
  const [winnersLoading, setWinnersLoading] = React.useState(false);
  const [includeLegacy, setIncludeLegacy] = React.useState(false);
  const [winnersDays] = React.useState(7);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadWinners = React.useCallback(async () => {
    setWinnersLoading(true);
    try {
      const params = new URLSearchParams({ threshold: "10", limit: "50", days: String(winnersDays) });
      if (includeLegacy) params.set("include_legacy", "1");
      const r = await fetch(`/api/admin/seo-pages/winners?${params}`, { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) setWinners(j.winners ?? []);
    } catch {
      setWinners([]);
    } finally {
      setWinnersLoading(false);
    }
  }, [includeLegacy, winnersDays]);

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
    await setIndexingBatch([slug], indexing);
  }

  function parseCSVLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (inQuotes) cur += c;
      else if (c === ",") {
        out.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  function findColumnIndex(header: string[], names: string[]): number {
    const lower = header.map((h) => h.toLowerCase().trim());
    for (const name of names) {
      const idx = lower.indexOf(name.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  }

  async function parseAndIngestCsv(text: string): Promise<{ ok: boolean; count?: number; error?: string }> {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { ok: false, error: "CSV must have header + at least one data row" };
    const header = parseCSVLine(lines[0]);
    const queryIdx = findColumnIndex(header, ["query", "top queries", "search query"]);
    const clicksIdx = findColumnIndex(header, ["clicks", "click"]);
    const impressionsIdx = findColumnIndex(header, ["impressions", "impression"]);
    const ctrIdx = findColumnIndex(header, ["ctr"]);
    const positionIdx = findColumnIndex(header, ["position", "avg. position", "average position"]);
    if (queryIdx < 0) return { ok: false, error: `Could not find Query column. Header: ${header.join(", ")}` };
    const rows: Array<{ query: string; clicks: number; impressions: number; ctr?: number; position?: number }> = [];
    for (let i = 1; i < lines.length; i++) {
      const parsed = parseCSVLine(lines[i]);
      const query = (parsed[queryIdx] ?? "").replace(/^"|"$/g, "").trim();
      if (!query) continue;
      const clicks = clicksIdx >= 0 ? parseInt(String(parsed[clicksIdx] ?? 0), 10) || 0 : 0;
      const impressions = impressionsIdx >= 0 ? parseInt(String(parsed[impressionsIdx] ?? 0), 10) || 0 : 0;
      const ctrStr = ctrIdx >= 0 ? String(parsed[ctrIdx] ?? "").replace("%", "") : "";
      const ctr = ctrStr ? parseFloat(ctrStr) : undefined;
      const posStr = positionIdx >= 0 ? String(parsed[positionIdx] ?? "") : "";
      const position = posStr ? parseFloat(posStr) : undefined;
      rows.push({ query, clicks, impressions, ...(ctr != null && !isNaN(ctr) && { ctr }), ...(position != null && !isNaN(position) && { position }) });
    }
    if (rows.length === 0) return { ok: false, error: "No valid rows parsed from CSV" };
    const r = await fetch("/api/admin/seo-queries/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const j = await r.json();
    if (j?.ok) return { ok: true, count: j.inserted ?? j.updated ?? rows.length };
    return { ok: false, error: j?.error ?? "Ingest failed" };
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setMsg(null);
    try {
      let csvText: string;
      const name = file.name.toLowerCase();
      if (name.endsWith(".zip")) {
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const queriesFile = Object.keys(zip.files).find(
          (k) => k.toLowerCase().endsWith("queries.csv") || k.toLowerCase() === "queries.csv"
        );
        if (!queriesFile) {
          setMsg("ZIP contains no Queries.csv. GSC export includes Chart, Countries, Devices, Pages, Queries, etc.");
          return;
        }
        const f = zip.files[queriesFile];
        csvText = await f.async("string");
      } else {
        csvText = await file.text();
      }
      const result = await parseAndIngestCsv(csvText);
      if (result.ok) {
        setMsg(`Ingested ${result.count} queries from ${name.endsWith(".zip") ? "GSC zip (Queries.csv)" : "CSV"}`);
        load();
        loadWinners();
      } else {
        setMsg(result.error ?? "Ingest failed");
      }
    } catch (err) {
      setMsg(String(err));
    } finally {
      setUploading(false);
    }
  }

  async function setIndexingBatch(slugs: string[], indexing: "index" | "noindex") {
    if (slugs.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/seo-pages/set-indexing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs, indexing }),
      });
      const j = await r.json();
      if (j?.ok) {
        const set = new Set(slugs);
        setPages((prev) => prev.map((p) => (set.has(p.slug) ? { ...p, indexing } : p)));
        setWinners((prev) => prev.filter((w) => !set.has(w.slug)));
        setMsg(`Set ${slugs.length} page(s) to ${indexing}`);
        load();
        loadWinners();
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
        <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white">
          ← Admin
        </Link>
      </div>

      <p className="text-sm text-neutral-400">
        Manage GSC-driven landing pages at /q/[slug]. Upload GSC CSV or run ingest script, then generate candidates and publish.
      </p>

      {msg && (
        <div className="rounded border border-neutral-700 bg-neutral-900/50 px-4 py-2 text-sm text-neutral-200">
          {msg}
        </div>
      )}

      {/* SEO Winners */}
      <section className="rounded border border-emerald-900/50 bg-emerald-950/20 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-emerald-200">SEO Winners (Eligible for Indexing)</span>
          <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">Window: last {winnersDays} days</span>
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input type="checkbox" checked={includeLegacy} onChange={(e) => setIncludeLegacy(e.target.checked)} className="rounded" />
            Include legacy metrics (unbounded)
          </label>
        </div>
        <p className="text-xs text-neutral-400">Pages here are receiving impressions but are still noindex. Default: fresh metrics only.</p>
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
                  <th className="text-left p-2 tabular-nums">Impact</th>
                  <th className="text-left p-2 tabular-nums">Impressions</th>
                  <th className="text-left p-2 tabular-nums">Clicks</th>
                  <th className="text-left p-2 tabular-nums">CTR</th>
                  <th className="text-left p-2 tabular-nums">Position</th>
                  <th className="text-left p-2">Signals</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w) => {
                  const imp = w.impressions ?? 0;
                  const ctr = w.ctr ?? 0;
                  const impactScore = imp > 0 && ctr > 0 ? Math.round(imp * ctr) : 0;
                  const highImpressions = imp >= 1000;
                  const highCtr = ctr >= 0.03;
                  const nearPage1 = w.position != null && w.position <= 15;
                  return (
                  <tr key={w.slug} className={`border-b border-neutral-800 ${highImpressions ? "bg-emerald-950/20" : ""}`}>
                    <td className="p-2">
                      <span className="flex items-center gap-2">
                        <a href={`/q/${w.slug}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
                          {w.slug}
                        </a>
                        {w.is_legacy && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-medium">LEGACY</span>
                        )}
                      </span>
                    </td>
                    <td className="p-2 tabular-nums">{impactScore}</td>
                    <td className="p-2 tabular-nums">{w.impressions}</td>
                    <td className="p-2 tabular-nums">{w.clicks}</td>
                    <td className="p-2 tabular-nums">{w.ctr != null ? `${(w.ctr * 100).toFixed(2)}%` : "—"}</td>
                    <td className="p-2 tabular-nums">{w.position ?? "—"}</td>
                    <td className="p-2">
                      <span className="flex flex-wrap gap-1">
                        {highImpressions && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300">High impressions</span>}
                        {highCtr && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300">High CTR</span>}
                        {nearPage1 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300">Near page 1</span>}
                      </span>
                    </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.zip"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || uploading}
          className="px-4 py-2 rounded bg-neutral-600 hover:bg-neutral-500 disabled:opacity-60 text-sm"
        >
          {uploading ? "Uploading…" : "Upload GSC CSV or ZIP"}
        </button>
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
          <option value="impact_desc">Sort by impact (default)</option>
          <option value="priority_desc">Sort by priority</option>
          <option value="impressions_desc">Sort by impressions (high)</option>
          <option value="impressions_asc">Sort by impressions (low)</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={joinMetrics} onChange={(e) => setJoinMetrics(e.target.checked)} className="rounded" />
          Include metrics
        </label>
      </div>

      {/* Top Actions Today */}
      <section className="rounded border border-cyan-900/50 bg-cyan-950/20 p-4">
        <div className="font-medium text-cyan-200 mb-3">Top Actions Today</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const slugs = winners.slice(0, 5).map((w) => w.slug);
              if (slugs.length) setIndexingBatch(slugs, "index");
              else setMsg("No winners to index");
            }}
            disabled={busy || winners.length === 0}
            className="px-3 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-60 text-sm"
          >
            Index top 5 winners
          </button>
          <button
            onClick={() => {
              const slugs = pages
                .filter((p) => p.status === "published" && (p.indexing ?? "noindex") === "noindex" && (p.impressions ?? 0) >= 1000)
                .map((p) => p.slug);
              if (slugs.length) setIndexingBatch(slugs, "index");
              else setMsg("No noindex pages with impressions ≥ 1000");
            }}
            disabled={busy || !joinMetrics}
            className="px-3 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-60 text-sm"
          >
            Index pages with impressions ≥ 1000
          </button>
          <button
            onClick={() => {
              const slugs = pages
                .filter((p) => p.status === "published" && (p.indexing ?? "noindex") === "noindex" && (p.ctr ?? 0) >= 0.03)
                .map((p) => p.slug);
              if (slugs.length) setIndexingBatch(slugs, "index");
              else setMsg("No noindex pages with CTR ≥ 3%");
            }}
            disabled={busy || !joinMetrics}
            className="px-3 py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-60 text-sm"
          >
            Index pages with CTR ≥ 3%
          </button>
        </div>
      </section>

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
                    <th className="text-left p-3 tabular-nums">Impact</th>
                    <th className="text-left p-3 tabular-nums">Impressions</th>
                    <th className="text-left p-3 tabular-nums">Clicks</th>
                    <th className="text-left p-3">Signals</th>
                  </>
                )}
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => {
                const imp = Number(p.impressions ?? 0);
                const ctr = Number(p.ctr ?? 0);
                const pos = p.position != null ? Number(p.position) : null;
                const impactScore = imp > 0 && ctr > 0 ? Math.round(imp * ctr) : 0;
                const highImpressions = imp >= 1000;
                const highCtr = ctr >= 0.03;
                const nearPage1 = pos != null && pos <= 15;
                const indexingVal = p.indexing ?? "noindex";
                return (
                <tr
                  key={p.id}
                  className={`border-b border-neutral-800 ${highImpressions ? "bg-emerald-950/20" : ""}`}
                >
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
                        onClick={() => setIndexing(p.slug, indexingVal === "index" ? "noindex" : "index")}
                        disabled={busy}
                        className={`text-xs px-2 py-0.5 rounded ${indexingVal === "index" ? "bg-green-900/60 text-green-300" : "bg-amber-900/60 text-amber-300"} hover:opacity-90`}
                        title={indexingVal === "index" ? "Click to set noindex" : "Click to set index (include in sitemap)"}
                      >
                        {indexingVal}
                      </button>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded ${indexingVal === "index" ? "bg-green-900/40 text-green-400/70" : "bg-amber-900/40 text-amber-400/70"}`}>{indexingVal}</span>
                    )}
                  </td>
                  {joinMetrics && (
                    <>
                      <td className="p-3 tabular-nums text-neutral-300">{impactScore}</td>
                      <td className="p-3 tabular-nums text-neutral-400">{p.impressions ?? "—"}</td>
                      <td className="p-3 tabular-nums text-neutral-400">{p.clicks ?? "—"}</td>
                      <td className="p-3">
                        <span className="flex flex-wrap gap-1">
                          {highImpressions && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300">High impressions</span>}
                          {highCtr && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300">High CTR</span>}
                          {nearPage1 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300">Near page 1</span>}
                        </span>
                      </td>
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
              );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && pages.length === 0 && (
        <p className="text-sm text-neutral-500">
          No pages. Upload GSC export (CSV or ZIP with Queries.csv) or run the ingest script, then click &quot;Generate from queries&quot;.
        </p>
      )}
    </div>
  );
}
