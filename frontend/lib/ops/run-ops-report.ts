/**
 * Run ops report checks. Used by cron routes.
 */
import { getAdmin } from "@/app/api/_lib/supa";
import { costUSD } from "@/lib/ai/pricing";
import { postOpsReportToDiscord } from "@/lib/ops/discord";

const JOB_KEYS = [
  "job:last:bulk_scryfall",
  "job:last:bulk_price_import",
  "job:last:price_snapshot_bulk",
  "job:last:deck-costs",
  "job:last:meta-signals",
  "job:last:top-cards",
  "job:last:commander-aggregates",
];

const AI_LIMIT = 200;
const SEO_WINNERS_THRESHOLD = 10;
const SEO_WINNERS_LIMIT = 50;
const STALE_HOURS = 48;

function costUSDFromRow(r: { model?: string | null; input_tokens?: number | null; output_tokens?: number | null }): number {
  return costUSD(String(r.model ?? ""), Number(r.input_tokens) || 0, Number(r.output_tokens) || 0);
}

export type ReportType = "daily_ops" | "weekly_ops";

export async function runOpsReport(reportType: ReportType): Promise<{
  ok: boolean;
  report_id: string | null;
  report_type: string;
  status: "ok" | "warn" | "fail";
  summary: string;
  duration_ms: number;
  details: Record<string, unknown>;
}> {
  const start = Date.now();
  const admin = getAdmin();
  if (!admin) {
    return {
      ok: false,
      report_id: null,
      report_type: reportType,
      status: "fail",
      summary: "missing_service_role_key",
      duration_ms: Date.now() - start,
      details: {},
    };
  }

  const details: Record<string, unknown> = {};
  let status: "ok" | "warn" | "fail" = "ok";
  const warnings: string[] = [];

  try {
    const { data: aiRows } = await admin.from("ai_usage").select("id,model,input_tokens,output_tokens,cost_usd").order("created_at", { ascending: false }).limit(AI_LIMIT);
    let mismatches = 0;
    const sample: Array<{ id: string; stored: number; expected: number }> = [];
    const ABS = 1e-6;
    const REL = 0.01;
    for (const r of aiRows || []) {
      const stored = Number(r.cost_usd) || 0;
      const expected = costUSDFromRow(r);
      const absDiff = Math.abs(stored - expected);
      const relDiff = expected > 0 ? absDiff / expected : absDiff;
      if (absDiff > ABS && relDiff > REL) {
        mismatches++;
        if (sample.length < 5) sample.push({ id: r.id, stored, expected });
      }
    }
    const mismatchRate = (aiRows?.length ?? 0) > 0 ? (mismatches / aiRows!.length) * 100 : 0;
    details.ai_cost_audit = { mismatch_rate: mismatchRate, sample_mismatches: sample, rows_checked: aiRows?.length ?? 0 };
    if (mismatchRate > 10) {
      status = "warn";
      warnings.push(`AI cost mismatch ${mismatchRate.toFixed(1)}%`);
    }
  } catch (e) {
    details.ai_cost_audit = { error: (e as Error).message };
  }

  try {
    const { data: routeRows } = await admin.from("ai_usage").select("route").order("created_at", { ascending: false }).limit(AI_LIMIT);
    const total = routeRows?.length ?? 0;
    const nullCount = (routeRows || []).filter((r) => r.route == null || r.route === "").length;
    const routeNullPct = total > 0 ? (nullCount / total) * 100 : 0;
    const byRoute = new Map<string, number>();
    for (const r of routeRows || []) {
      const rt = r.route || "null";
      byRoute.set(rt, (byRoute.get(rt) || 0) + 1);
    }
    const topRoutes = Array.from(byRoute.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ route: k, count: v }));
    details.route_coverage = { route_null_pct: routeNullPct, top_routes: topRoutes };
    if (routeNullPct > 20) {
      status = (status as "ok" | "warn" | "fail") === "fail" ? "fail" : "warn";
      warnings.push(`Route null ${routeNullPct.toFixed(1)}%`);
    }
  } catch (e) {
    details.route_coverage = { error: (e as Error).message };
  }

  try {
    const { data: qRows } = await admin.from("ai_usage").select("request_kind,layer0_mode,response_truncated,error_code,cache_hit,latency_ms").order("created_at", { ascending: false }).limit(AI_LIMIT);
    const total = qRows?.length ?? 0;
    let err429 = 0;
    const latencies: number[] = [];
    for (const r of qRows || []) {
      if (r.error_code && String(r.error_code).includes("429")) err429++;
      if (r.latency_ms != null) latencies.push(Number(r.latency_ms));
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : null;
    const rate429 = total > 0 ? (err429 / total) * 100 : 0;
    const fullLlm = (qRows || []).filter((r) => ((r.request_kind || r.layer0_mode) || "").toUpperCase() === "FULL_LLM").length;
    const miniOnly = (qRows || []).filter((r) => ((r.request_kind || r.layer0_mode) || "").toUpperCase() === "MINI_ONLY").length;
    const noLlm = (qRows || []).filter((r) => ((r.request_kind || r.layer0_mode) || "").toUpperCase() === "NO_LLM").length;
    const truncated = (qRows || []).filter((r) => r.response_truncated === true).length;
    const cacheHit = (qRows || []).filter((r) => r.cache_hit === true).length;
    details.quality_sentinel = {
      full_llm: fullLlm,
      mini_only: miniOnly,
      no_llm: noLlm,
      truncation_rate_pct: total > 0 ? (truncated / total) * 100 : 0,
      err429_rate_pct: rate429,
      cache_hit_pct: total > 0 ? (cacheHit / total) * 100 : 0,
      p95_latency_ms: p95,
      requests: total,
    };
    if (rate429 > 5) {
      status = (status as "ok" | "warn" | "fail") === "fail" ? "fail" : "warn";
      warnings.push(`429 rate ${rate429.toFixed(1)}%`);
    }
  } catch (e) {
    details.quality_sentinel = { error: (e as Error).message };
  }

  try {
    const { data: configRows } = await admin.from("app_config").select("key, value").in("key", JOB_KEYS);
    const configMap = new Map((configRows || []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const now = Date.now();
    const staleJobs: string[] = [];
    for (const key of JOB_KEYS) {
      const val = configMap.get(key);
      if (!val) continue;
      try {
        const ageHours = (now - new Date(val).getTime()) / (1000 * 60 * 60);
        if (ageHours > STALE_HOURS) staleJobs.push(`${key.replace("job:last:", "")} (${Math.round(ageHours)}h)`);
      } catch {}
    }
    details.job_health = {
      jobs: Object.fromEntries(JOB_KEYS.map((k) => [k, configMap.get(k) ?? null])),
      stale_jobs: staleJobs,
    };
    if (staleJobs.length > 2) {
      status = (status as "ok" | "warn" | "fail") === "fail" ? "fail" : "warn";
      warnings.push(`Stale jobs: ${staleJobs.slice(0, 2).join(", ")}`);
    }
  } catch (e) {
    details.job_health = { error: (e as Error).message };
  }

  try {
    const { data: seoPages } = await admin.from("seo_pages").select("id,slug,indexing,status,query");
    const byStatus = new Map<string, number>();
    const byIndexing = new Map<string, number>();
    for (const p of seoPages || []) {
      byStatus.set(p.status || "unknown", (byStatus.get(p.status || "unknown") || 0) + 1);
      byIndexing.set(p.indexing || "noindex", (byIndexing.get(p.indexing || "noindex") || 0) + 1);
    }
    const indexedCount = byIndexing.get("index") ?? 0;
    const queries = Array.from(new Set((seoPages || []).map((p: { query: string }) => p.query)));
    let topByImpressions: Array<{ slug: string; impressions: number }> = [];
    if (queries.length > 0) {
      const { data: metrics } = await admin.from("seo_queries").select("query, impressions").in("query", queries.slice(0, 500));
      const impByQuery = new Map((metrics || []).map((m: { query: string; impressions: number }) => [m.query, m.impressions ?? 0]));
      topByImpressions = (seoPages || [])
        .map((p: { slug: string; query: string }) => ({ slug: p.slug, impressions: impByQuery.get(p.query) ?? 0 }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10);
    }
    details.seo_health = { by_status: Object.fromEntries(byStatus), by_indexing: Object.fromEntries(byIndexing), indexed_page_count: indexedCount, top_10_by_impressions: topByImpressions };
  } catch (e) {
    details.seo_health = { error: (e as Error).message };
  }

  try {
    const { data: pages } = await admin.from("seo_pages").select("slug, title, query, priority, indexing").eq("indexing", "noindex").limit(500);
    const queries = Array.from(new Set((pages || []).map((p: { query: string }) => p.query)));
    let winners: Array<{ slug: string; title: string; impressions: number; clicks: number; ctr: number | null; position: number | null; priority: number }> = [];
    if (queries.length > 0) {
      const { data: metrics } = await admin.from("seo_queries").select("query, clicks, impressions, ctr, position").in("query", queries);
      const byQuery = new Map((metrics || []).map((m: { query: string; clicks: number; impressions: number; ctr?: number; position?: number }) => [m.query, { clicks: m.clicks ?? 0, impressions: m.impressions ?? 0, ctr: m.ctr ?? null, position: m.position ?? null }]));
      for (const p of pages || []) {
        const m = byQuery.get(p.query);
        if (!m || m.impressions < SEO_WINNERS_THRESHOLD) continue;
        winners.push({ slug: p.slug, title: p.title ?? p.slug, impressions: m.impressions, clicks: m.clicks, ctr: m.ctr, position: m.position, priority: p.priority ?? 0 });
      }
      winners = winners.sort((a, b) => b.impressions - a.impressions).slice(0, SEO_WINNERS_LIMIT);
    }
    details.seo_winners = { count: winners.length, top_slugs: winners.slice(0, 3).map((w) => w.slug), winners: winners.slice(0, 20) };
  } catch (e) {
    details.seo_winners = { error: (e as Error).message };
  }

  const durationMs = Date.now() - start;
  const summary = warnings.length > 0 ? warnings.join("; ") : "All checks passed.";
  const aiAudit = details.ai_cost_audit as { mismatch_rate?: number } | undefined;
  const routeCov = details.route_coverage as { route_null_pct?: number } | undefined;
  const quality = details.quality_sentinel as { err429_rate_pct?: number } | undefined;
  const jobHealth = details.job_health as { stale_jobs?: string[] } | undefined;
  const seoHealth = details.seo_health as { indexed_page_count?: number } | undefined;
  const seoWinners = details.seo_winners as { count?: number; top_slugs?: string[] } | undefined;

  let reportId: string | null = null;
  try {
    const { data: inserted, error } = await admin.from("ops_reports").insert({ report_type: reportType, status, summary, details, duration_ms: durationMs, error: null }).select("id").single();
    if (!error && inserted) reportId = (inserted as { id: string }).id;
  } catch (e) {
    console.error("[ops-report] Insert failed:", e);
  }

  postOpsReportToDiscord({
    status,
    reportType,
    aiMismatchRate: aiAudit?.mismatch_rate,
    rate429: quality?.err429_rate_pct,
    routeNullPct: routeCov?.route_null_pct,
    staleJobs: jobHealth?.stale_jobs,
    indexedPageCount: seoHealth?.indexed_page_count,
    seoWinnersCount: seoWinners?.count,
    seoWinnersSlugs: seoWinners?.top_slugs,
  });

  return {
    ok: true,
    report_id: reportId,
    report_type: reportType,
    status,
    summary,
    duration_ms: durationMs,
    details,
  };
}
