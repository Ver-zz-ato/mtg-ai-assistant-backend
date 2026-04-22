import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";
import { computeExtendedSummary } from "@/lib/observability/cost-audit-admin-compute";
import type { CostAuditAdminRow } from "@/lib/observability/cost-audit-admin-types";

export const runtime = "nodejs";

const FETCH_CAP = 8000;

const WINDOW_MIN: Record<string, number> = {
  "15m": 15,
  "1h": 60,
  "6h": 360,
  "24h": 1440,
  "7d": 10080,
};

type Row = CostAuditAdminRow;

function p95(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(0.95 * s.length) - 1));
  return s[idx];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function cacheRate(hits: number, total: number): number | null {
  if (!total) return null;
  return hits / total;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const windowKey = searchParams.get("window") || "24h";
    const minutes = WINDOW_MIN[windowKey] ?? WINDOW_MIN["24h"];
    const to = new Date();
    const from = new Date(to.getTime() - minutes * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const routeFilter = searchParams.get("route") || "";
    const eventFilter = searchParams.get("event_name") || "";
    const sourceFilter = searchParams.get("source") || "";
    const requestIdSearch = searchParams.get("request_id") || "";
    const userIdSearch = searchParams.get("user_id") || "";
    const componentFilter = searchParams.get("component") || "";
    const sessionIdFilter = searchParams.get("session_id") || "";
    const correlationFilter = searchParams.get("correlation_id") || "";
    const sourceDetailFilter = searchParams.get("source_detail") || "";
    const cacheHitParam = searchParams.get("cache_hit");
    const sort = searchParams.get("sort") || "newest";

    const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10) || 0);
    const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "40", 10) || 40));

    const applyFilters = (q: any) => {
      let x = q;
      if (routeFilter) x = x.eq("route", routeFilter);
      if (eventFilter) x = x.eq("event_name", eventFilter);
      if (sourceFilter) x = x.eq("source", sourceFilter);
      if (requestIdSearch) x = x.ilike("request_id", `%${requestIdSearch}%`);
      if (userIdSearch) x = x.ilike("user_id", `%${userIdSearch}%`);
      if (componentFilter) x = x.ilike("component", `%${componentFilter}%`);
      if (sessionIdFilter) x = x.ilike("session_id", `%${sessionIdFilter}%`);
      if (correlationFilter) x = x.ilike("correlation_id", `%${correlationFilter}%`);
      if (sourceDetailFilter) x = x.ilike("source_detail", `%${sourceDetailFilter}%`);
      if (cacheHitParam === "true") x = x.eq("cache_hit", true);
      if (cacheHitParam === "false") x = x.eq("cache_hit", false);
      return x;
    };

    const aggQ = applyFilters(
      admin
        .from("observability_cost_events")
        .select("*")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(FETCH_CAP),
    );

    const { data: aggRowsRaw, error: aggErr } = await aggQ;
    if (aggErr) {
      return NextResponse.json({ ok: false, error: aggErr.message }, { status: 500 });
    }

    const aggRows = (aggRowsRaw || []) as Row[];

    const off = page * pageSize;
    let recentBase = applyFilters(
      admin
        .from("observability_cost_events")
        .select("*")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    );
    if (sort === "oldest") {
      recentBase = recentBase.order("created_at", { ascending: true });
    } else if (sort === "duration_desc") {
      recentBase = recentBase.order("duration_ms", { ascending: false });
    } else {
      recentBase = recentBase.order("created_at", { ascending: false });
    }
    const recentQ = recentBase.range(off, off + pageSize - 1);

    const { data: recentRaw, error: recentErr } = await recentQ;
    if (recentErr) {
      return NextResponse.json({ ok: false, error: recentErr.message }, { status: 500 });
    }

    const recentRows = (recentRaw || []) as Row[];

    const pick = (pred: (r: Row) => boolean) => aggRows.filter(pred);

    const totalInSample = aggRows.length;
    const truncated = totalInSample >= FETCH_CAP;

    const playstyleRows = pick((r) => r.event_name === "playstyle.explain");
    const playstyleCacheKnown = playstyleRows.filter((r) => r.cache_hit !== null);

    const priceRows = pick((r) => r.event_name === "price.request");
    const priceCacheKnown = priceRows.filter((r) => r.cache_hit !== null);

    const fuzzyRows = pick((r) => r.event_name === "fuzzy.request");

    const shoutClose = pick((r) => r.event_name === "shout.stream.close");
    const shoutDurations = shoutClose.map((r) => r.duration_ms).filter((n): n is number => n != null);
    const shoutHistoryServer = pick((r) => r.event_name === "shout.history");
    const clientShoutMount = pick((r) => r.event_name === "client.shoutbox.mount");
    const clientHistoryDone = pick((r) => r.event_name === "client.shoutbox.history_done");
    const clientSseConnect = pick((r) => r.event_name === "client.shoutbox.sse_connect");
    const clientPollVis = pick((r) => r.event_name === "client.shoutbox.poll_visibility");

    const clientPollRefreshes = clientHistoryDone.filter(
      (r) => (r.meta as Record<string, unknown> | null)?.historySource === "poll",
    );
    const clientPostRefreshes = clientHistoryDone.filter(
      (r) => (r.meta as Record<string, unknown> | null)?.historySource === "post",
    );
    const clientVisibilityRefreshes = clientHistoryDone.filter(
      (r) => (r.meta as Record<string, unknown> | null)?.historySource === "visibility",
    );

    let latestShoutMount: Row | null = null;
    for (const r of clientShoutMount) {
      if (!latestShoutMount || r.created_at > latestShoutMount.created_at) latestShoutMount = r;
    }
    const latestMeta = (latestShoutMount?.meta as Record<string, unknown> | undefined) || undefined;
    const latestClientRealtimeMode =
      typeof latestMeta?.realtimeMode === "string" ? latestMeta.realtimeMode : null;
    const latestClientPollMs =
      typeof latestMeta?.pollMs === "number" && Number.isFinite(latestMeta.pollMs)
        ? latestMeta.pollMs
        : null;

    const playstyleSourceCounts: Record<string, number> = {};
    for (const r of playstyleRows) {
      const k = r.source_detail || "(none)";
      playstyleSourceCounts[k] = (playstyleSourceCounts[k] ?? 0) + 1;
    }

    const cacheKeyCounts = new Map<string, number>();
    for (const r of playstyleRows) {
      if (!r.cache_key) continue;
      cacheKeyCounts.set(r.cache_key, (cacheKeyCounts.get(r.cache_key) ?? 0) + 1);
    }
    const repeatedCacheKeys = [...cacheKeyCounts.entries()]
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([cache_key, count]) => ({ cache_key, count }));

    const priceGet = priceRows.filter((r) => r.method === "GET");
    const pricePost = priceRows.filter((r) => r.method === "POST");
    let scryfallUsed = 0;
    let fxUsed = pick((r) => r.event_name === "price.fx.network").length;
    for (const r of priceRows) {
      const m = r.meta || {};
      if (m.scryfallUsed === true) scryfallUsed += 1;
    }

    let biggestNames: { namesCount: number; method: string | null; created_at: string } | null = null;
    for (const r of priceRows) {
      const n = r.count_1;
      if (n == null) continue;
      if (!biggestNames || n > biggestNames.namesCount) {
        biggestNames = { namesCount: n, method: r.method, created_at: r.created_at };
      }
    }

    const fuzzyNames = fuzzyRows.map((r) => r.count_1).filter((n): n is number => n != null);
    let fuzzyExternal = 0;
    let fuzzyScryfallHttp = 0;
    for (const r of fuzzyRows) {
      if (r.meta?.externalLookup === true) fuzzyExternal += 1;
      const http = r.count_2;
      if (typeof http === "number" && http > 0) fuzzyScryfallHttp += http;
    }

    type Board = {
      key: string;
      route: string | null;
      event_name: string;
      calls: number;
      durations: number[];
      errors: number;
      cacheHits: number;
      cacheTotal: number;
      latestAt: string | null;
    };

    const board = new Map<string, Board>();
    for (const r of aggRows) {
      const key = `${r.event_name}::${r.route ?? ""}`;
      let b = board.get(key);
      if (!b) {
        b = {
          key,
          route: r.route,
          event_name: r.event_name,
          calls: 0,
          durations: [],
          errors: 0,
          cacheHits: 0,
          cacheTotal: 0,
          latestAt: null,
        };
        board.set(key, b);
      }
      b.calls += 1;
      if (r.success === false) b.errors += 1;
      if (r.cache_hit !== null) {
        b.cacheTotal += 1;
        if (r.cache_hit) b.cacheHits += 1;
      }
      if (r.duration_ms != null) b.durations.push(r.duration_ms);
      if (!b.latestAt || r.created_at > b.latestAt) b.latestAt = r.created_at;
    }

    const leaderboard = [...board.values()]
      .map((b) => ({
        key: b.key,
        route: b.route,
        event_name: b.event_name,
        calls: b.calls,
        avgDurationMs: avg(b.durations),
        p95DurationMs: p95(b.durations),
        errors: b.errors,
        cacheHitPct: cacheRate(b.cacheHits, b.cacheTotal),
        latestAt: b.latestAt,
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 40);

    const shoutRecent = pick((r) => r.event_name === "shout.stream.open" || r.event_name === "shout.stream.close")
      .slice(0, 15)
      .map((r) => ({
        created_at: r.created_at,
        event_name: r.event_name,
        duration_ms: r.duration_ms,
        request_id: r.request_id,
        count_1: r.count_1,
        meta: r.meta,
      }));

    const playstyleRecent = playstyleRows.slice(0, 15).map((r) => ({
      created_at: r.created_at,
      cache_hit: r.cache_hit,
      source_detail: r.source_detail,
      cache_key: r.cache_key ? String(r.cache_key).slice(0, 80) : null,
      duration_ms: r.duration_ms,
    }));

    const priceRecent = priceRows.slice(0, 15).map((r) => ({
      created_at: r.created_at,
      method: r.method,
      cache_hit: r.cache_hit,
      count_1: r.count_1,
      meta: { scryfallUsed: r.meta?.scryfallUsed, currency: r.meta?.currency },
      duration_ms: r.duration_ms,
    }));

    const fuzzyRecent = fuzzyRows.slice(0, 15).map((r) => ({
      created_at: r.created_at,
      count_1: r.count_1,
      count_2: r.count_2,
      meta: { externalLookup: r.meta?.externalLookup },
      duration_ms: r.duration_ms,
    }));

    const forensics = computeExtendedSummary(aggRows as CostAuditAdminRow[]);

    return NextResponse.json({
      ok: true,
      window: windowKey,
      from: fromIso,
      to: toIso,
      sort,
      summary: {
        totalEvents: totalInSample,
        truncatedSample: truncated,
        homepageRenders: pick((r) => r.event_name === "page.render").length,
        shoutStreamOpens: pick((r) => r.event_name === "shout.stream.open").length,
        shoutStreamCloses: shoutClose.length,
        shoutHistoryServer: shoutHistoryServer.length,
        playstyleExplainCalls: playstyleRows.length,
        playstyleCacheHitRate: cacheRate(
          playstyleCacheKnown.filter((r) => r.cache_hit === true).length,
          playstyleCacheKnown.length,
        ),
        priceRequests: priceRows.length,
        priceCacheHitRate: cacheRate(
          priceCacheKnown.filter((r) => r.cache_hit === true).length,
          priceCacheKnown.length,
        ),
        fuzzyRequests: fuzzyRows.length,
        fuzzyExternalLookupRate: fuzzyRows.length ? fuzzyExternal / fuzzyRows.length : null,
        commentRequests: pick((r) => r.event_name === "deck.comments").length,
      },
      forensics,
      leaderboard,
      shout: {
        openCount: pick((r) => r.event_name === "shout.stream.open").length,
        closeCount: shoutClose.length,
        avgDurationMs: avg(shoutDurations),
        medianDurationMs: median(shoutDurations),
        shortCloseCount: shoutClose.filter((r) => (r.duration_ms ?? 0) < 10_000).length,
        recent: shoutRecent,
        historyServerCount: shoutHistoryServer.length,
        clientHistoryDoneCount: clientHistoryDone.length,
        clientPollRefreshCount: clientPollRefreshes.length,
        clientPostRefreshCount: clientPostRefreshes.length,
        clientVisibilityRefreshCount: clientVisibilityRefreshes.length,
        clientSseConnectCount: clientSseConnect.length,
        clientPollVisibilityEvents: clientPollVis.length,
        latestClientRealtimeMode,
        latestClientPollMs,
        deployEnvRealtimeMode: process.env.NEXT_PUBLIC_SHOUT_REALTIME_MODE ?? null,
        deployEnvPollMs: process.env.NEXT_PUBLIC_SHOUT_POLL_MS ?? null,
      },
      playstyle: {
        total: playstyleRows.length,
        cacheHitRate: cacheRate(
          playstyleCacheKnown.filter((r) => r.cache_hit === true).length,
          playstyleCacheKnown.length,
        ),
        sourceBreakdown: playstyleSourceCounts,
        repeatedCacheKeys,
        recent: playstyleRecent,
        deepDive: forensics.playstyle,
      },
      price: {
        getCount: priceGet.length,
        postCount: pricePost.length,
        cacheHitRate: cacheRate(
          priceCacheKnown.filter((r) => r.cache_hit === true).length,
          priceCacheKnown.length,
        ),
        scryfallUsed,
        fxUsed,
        biggestNamesRequest: biggestNames,
        recent: priceRecent,
      },
      fuzzy: {
        total: fuzzyRows.length,
        avgNamesCount: avg(fuzzyNames),
        externalLookupCount: fuzzyExternal,
        scryfallHttpSum: fuzzyScryfallHttp,
        recent: fuzzyRecent,
      },
      recent: {
        page,
        pageSize,
        rows: recentRows.map((r) => ({
          ...r,
          metaPreview: summarizeMeta(r.meta),
        })),
      },
    });
  } catch (e) {
    console.warn("[CostAudit] admin GET failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

function summarizeMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  const keys = Object.keys(meta).slice(0, 8);
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string") out[k] = v.length > 80 ? `${v.slice(0, 80)}…` : v;
    else out[k] = v;
  }
  return out;
}
