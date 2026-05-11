import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";
import { AI_USAGE_SOURCE_MANATAP_APP, isAppAiUsageRow } from "@/lib/ai/manatap-client-origin";

export const runtime = "nodejs";

const LEGACY_PRICING_CUTOFF = "2026-02-14";

/**
 * App-only AI usage overview: `source = manatap_app` OR `source_page` like `app%`.
 * Rows are re-validated with isAppAiUsageRow() after fetch (defensive).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });

    const sp = req.nextUrl.searchParams;
    const fromParam = sp.get("from") || "";
    const toParam = sp.get("to") || "";
    const days = Math.min(90, Math.max(1, parseInt(sp.get("days") || "14", 10) || 14));
    const excludeLegacyCost = sp.get("exclude_legacy_cost") === "true";
    const modelFilter = sp.get("model") || "";
    const routeFilter = sp.get("route") || "";
    const sourcePageFilter = sp.get("source_page") || "";
    const requestKindFilter = sp.get("request_kind") || "";
    const userIdFilter = sp.get("user_id") || "";
    const cacheHitFilter = sp.get("cache_hit") || "";
    const errorOnly = sp.get("error_only") === "true";
    const from =
      fromParam && toParam
        ? new Date(fromParam + "T00:00:00Z").toISOString()
        : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const to =
      fromParam && toParam
        ? new Date(toParam + "T23:59:59.999Z").toISOString()
        : new Date().toISOString();

    const selectCols =
      "id,created_at,user_id,route,model,source,source_page,request_kind,layer0_mode,context_source,used_two_stage,cache_hit,input_tokens,output_tokens,cost_usd,latency_ms,planner_cost_usd,pricing_version,error_code,is_guest,user_tier";
    let q = admin
      .from("ai_usage")
      .select(selectCols)
      .gte("created_at", from)
      .lte("created_at", to)
      .or(`source.eq.${AI_USAGE_SOURCE_MANATAP_APP},source_page.like.app%`)
      .order("created_at", { ascending: false });
    if (modelFilter) q = q.eq("model", modelFilter);
    if (routeFilter) q = q.eq("route", routeFilter);
    if (sourcePageFilter) q = q.eq("source_page", sourcePageFilter);
    if (requestKindFilter) q = q.eq("request_kind", requestKindFilter);
    if (userIdFilter) q = q.eq("user_id", userIdFilter);
    if (cacheHitFilter === "true") q = q.eq("cache_hit", true);
    if (cacheHitFilter === "false") q = q.eq("cache_hit", false);
    if (errorOnly) q = q.not("error_code", "is", null);
    if (excludeLegacyCost) {
      q = q.gte("pricing_version", LEGACY_PRICING_CUTOFF);
    }
    const { data: rows, error } = await q;

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const list = ((rows || []) as Array<Record<string, unknown>>).filter((r) =>
      isAppAiUsageRow({
        source: r.source as string | null,
        source_page: r.source_page as string | null,
      })
    );

    const rk = (r: Record<string, unknown>) => ((r.request_kind ?? r.layer0_mode) as string) || "unknown";
    const p95 = (arr: number[]) => {
      if (arr.length === 0) return null;
      const s = [...arr].sort((a, b) => a - b);
      const i = Math.floor(0.95 * s.length);
      return s[i] ?? null;
    };

    const totals = {
      total_cost_usd: 0,
      total_requests: 0,
      total_tokens_in: 0,
      total_tokens_out: 0,
      avg_cost: 0,
      avg_latency_ms: null as number | null,
      p95_latency_ms: null as number | null,
    };
    const by_model = new Map<
      string,
      { cost_usd: number; requests: number; tokens_in: number; tokens_out: number; avg_cost: number }
    >();
    const by_route = new Map<
      string,
      {
        total_cost_usd: number;
        total_requests: number;
        total_tokens_in: number;
        total_tokens_out: number;
        avg_cost: number;
      }
    >();
    const by_source_page = new Map<string, { cost_usd: number; requests: number }>();
    const by_request_kind = new Map<string, { cost_usd: number; requests: number }>();
    const by_user = new Map<
      string,
      { cost_usd: number; requests: number; tokens_in: number; tokens_out: number; errors: number; is_guest: boolean }
    >();
    const by_error = new Map<string, { cost_usd: number; requests: number }>();
    const dailyBuckets = new Map<string, { cost_usd: number; requests: number }>();
    const hourlyBuckets = new Map<string, { cost_usd: number; requests: number }>();
    const latencies: number[] = [];
    let latencySum = 0;
    let latencyN = 0;
    let cacheHits = 0;
    let cacheKnown = 0;
    let errors = 0;

    for (const r of list) {
      const cost = Number(r.cost_usd) || 0;
      const plannerCost = Number(r.planner_cost_usd) || 0;
      const totalCost = cost + plannerCost;
      const it = Number(r.input_tokens) || 0;
      const ot = Number(r.output_tokens) || 0;
      const lat = typeof r.latency_ms === "number" ? r.latency_ms : null;
      if (lat != null) {
        latencies.push(lat);
        latencySum += lat;
        latencyN += 1;
      }

      totals.total_cost_usd += totalCost;
      totals.total_requests += 1;
      totals.total_tokens_in += it;
      totals.total_tokens_out += ot;
      if (typeof r.cache_hit === "boolean") {
        cacheKnown += 1;
        if (r.cache_hit) cacheHits += 1;
      }
      if (r.error_code) errors += 1;

      const model = String(r.model || "unknown");
      if (!by_model.has(model))
        by_model.set(model, { cost_usd: 0, requests: 0, tokens_in: 0, tokens_out: 0, avg_cost: 0 });
      const bm = by_model.get(model)!;
      bm.cost_usd += totalCost;
      bm.requests += 1;
      bm.tokens_in += it;
      bm.tokens_out += ot;

      const route = String(r.route || "unknown");
      if (!by_route.has(route))
        by_route.set(route, {
          total_cost_usd: 0,
          total_requests: 0,
          total_tokens_in: 0,
          total_tokens_out: 0,
          avg_cost: 0,
        });
      const br = by_route.get(route)!;
      br.total_cost_usd += totalCost;
      br.total_requests += 1;
      br.total_tokens_in += it;
      br.total_tokens_out += ot;

      const srcPage = r.source_page ? String(r.source_page).trim() : null;
      const srcKey = srcPage || `(route:${route})`;
      if (!by_source_page.has(srcKey)) by_source_page.set(srcKey, { cost_usd: 0, requests: 0 });
      by_source_page.get(srcKey)!.cost_usd += totalCost;
      by_source_page.get(srcKey)!.requests += 1;

      const kind = rk(r);
      if (!by_request_kind.has(kind)) by_request_kind.set(kind, { cost_usd: 0, requests: 0 });
      by_request_kind.get(kind)!.cost_usd += totalCost;
      by_request_kind.get(kind)!.requests += 1;

      const userKey = r.user_id ? String(r.user_id) : r.is_guest ? "(guest)" : "(unknown)";
      if (!by_user.has(userKey)) {
        by_user.set(userKey, { cost_usd: 0, requests: 0, tokens_in: 0, tokens_out: 0, errors: 0, is_guest: !!r.is_guest });
      }
      const bu = by_user.get(userKey)!;
      bu.cost_usd += totalCost;
      bu.requests += 1;
      bu.tokens_in += it;
      bu.tokens_out += ot;
      if (r.error_code) bu.errors += 1;

      const errKey = r.error_code ? String(r.error_code) : "ok";
      if (!by_error.has(errKey)) by_error.set(errKey, { cost_usd: 0, requests: 0 });
      by_error.get(errKey)!.cost_usd += totalCost;
      by_error.get(errKey)!.requests += 1;

      const day = String(r.created_at).slice(0, 10);
      if (!dailyBuckets.has(day)) dailyBuckets.set(day, { cost_usd: 0, requests: 0 });
      dailyBuckets.get(day)!.cost_usd += totalCost;
      dailyBuckets.get(day)!.requests += 1;

      const hour = String(r.created_at).slice(0, 13);
      if (!hourlyBuckets.has(hour)) hourlyBuckets.set(hour, { cost_usd: 0, requests: 0 });
      hourlyBuckets.get(hour)!.cost_usd += totalCost;
      hourlyBuckets.get(hour)!.requests += 1;
    }

    totals.avg_cost = totals.total_requests ? totals.total_cost_usd / totals.total_requests : 0;
    totals.p95_latency_ms = p95(latencies);
    totals.avg_latency_ms = latencyN ? latencySum / latencyN : null;

    for (const bm of by_model.values()) {
      bm.avg_cost = bm.requests ? bm.cost_usd / bm.requests : 0;
    }
    for (const br of by_route.values()) {
      br.avg_cost = br.total_requests ? br.total_cost_usd / br.total_requests : 0;
    }

    const round = (n: number) => Math.round(n * 10000) / 10000;
    const series_daily = Array.from(dailyBuckets.entries())
      .map(([date, t]) => ({ date, cost_usd: round(t.cost_usd), requests: t.requests }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const series_hourly = Array.from(hourlyBuckets.entries())
      .map(([hour, t]) => ({ hour, cost_usd: round(t.cost_usd), requests: t.requests }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return NextResponse.json({
      ok: true,
      filter: {
        description: "source = manatap_app OR source_page starts with app_",
        source_marker: AI_USAGE_SOURCE_MANATAP_APP,
      },
      totals: {
        ...totals,
        total_cost_usd: round(totals.total_cost_usd),
        avg_cost: round(totals.avg_cost),
        avg_latency_ms: totals.avg_latency_ms != null ? round(totals.avg_latency_ms) : null,
        errors,
        error_rate: totals.total_requests ? round(errors / totals.total_requests) : 0,
        cache_hits: cacheHits,
        cache_known: cacheKnown,
        cache_hit_rate: cacheKnown ? round(cacheHits / cacheKnown) : null,
      },
      by_model: Array.from(by_model.entries())
        .map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd), avg_cost: round(t.avg_cost) }))
        .sort((a, b) => b.cost_usd - a.cost_usd),
      by_route: Array.from(by_route.entries())
        .map(([id, t]) => ({
          id,
          ...t,
          total_cost_usd: round(t.total_cost_usd),
          avg_cost: round(t.avg_cost),
        }))
        .sort((a, b) => b.total_cost_usd - a.total_cost_usd),
      by_source_page: Array.from(by_source_page.entries())
        .map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) }))
        .sort((a, b) => b.cost_usd - a.cost_usd),
      by_request_kind: Array.from(by_request_kind.entries())
        .map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) }))
        .sort((a, b) => b.cost_usd - a.cost_usd),
      by_user: Array.from(by_user.entries())
        .map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) }))
        .sort((a, b) => b.cost_usd - a.cost_usd)
        .slice(0, 50),
      by_error: Array.from(by_error.entries())
        .map(([id, t]) => ({ id, ...t, cost_usd: round(t.cost_usd) }))
        .sort((a, b) => b.requests - a.requests),
      series_daily,
      series_hourly,
      options: {
        source_pages: Array.from(by_source_page.keys()).filter((v) => !v.startsWith("(route:")).sort(),
        models: Array.from(by_model.keys()).sort(),
        routes: Array.from(by_route.keys()).sort(),
        request_kinds: Array.from(by_request_kind.keys()).sort(),
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message || "server_error" }, { status: 500 });
  }
}
