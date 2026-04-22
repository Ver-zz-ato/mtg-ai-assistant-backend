import type { CostAuditAdminRow } from "@/lib/observability/cost-audit-admin-types";
import { metaNum, metaStr } from "@/lib/observability/cost-audit-admin-types";

function countEv(rows: CostAuditAdminRow[], eventName: string) {
  return rows.filter((r) => r.event_name === eventName).length;
}

function uniq(rows: CostAuditAdminRow[], key: keyof CostAuditAdminRow): number {
  const s = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (v != null && String(v)) s.add(String(v));
  }
  return s.size;
}

type BurstBucket = { windowSec: number; top: { key: string; count: number }[] };

function topEventTotals(rows: CostAuditAdminRow[], limit: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const en = r.event_name || "?";
    m.set(en, (m.get(en) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

/** For each window size, show event mix in the single hottest time bucket (by total events). */
export function computeBurstBuckets(rows: CostAuditAdminRow[], windowsSec: number[]): BurstBucket[] {
  return windowsSec.map((windowSec) => {
    const byBucket = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (Number.isNaN(t)) continue;
      const bk = String(Math.floor(t / (windowSec * 1000)));
      const en = r.event_name || "?";
      if (!byBucket.has(bk)) byBucket.set(bk, new Map());
      const m = byBucket.get(bk)!;
      m.set(en, (m.get(en) ?? 0) + 1);
    }
    let bestKey = "";
    let bestSum = 0;
    for (const [bk, evMap] of byBucket) {
      let sum = 0;
      for (const c of evMap.values()) sum += c;
      if (sum > bestSum) {
        bestSum = sum;
        bestKey = bk;
      }
    }
    const evMap = bestKey ? byBucket.get(bestKey) : null;
    const top = evMap
      ? [...evMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([key, count]) => ({ key, count }))
      : topEventTotals(rows, 12);
    return { windowSec, top };
  });
}

export function topSessionVolumes(rows: CostAuditAdminRow[], limit: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const sid = r.session_id || r.correlation_id;
    if (!sid) continue;
    m.set(sid, (m.get(sid) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([session_id, events]) => ({ session_id, events }));
}

export function topDuplicateRequestIds(rows: CostAuditAdminRow[], limit: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.request_id) continue;
    m.set(r.request_id, (m.get(r.request_id) ?? 0) + 1);
  }
  return [...m.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([request_id, duplicates]) => ({ request_id, duplicates }));
}

export function topComponents(rows: CostAuditAdminRow[], limit: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const c = r.component || metaStr(r, "component");
    if (!c) continue;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([component, events]) => ({ component, events }));
}

export function playstyleFlowGroups(rows: CostAuditAdminRow[], limitSessions: number) {
  const playEvents = [
    "client.playstyle.explain_effect",
    "client.playstyle.explain_fetch_start",
    "client.playstyle.explain_fetch_done",
    "playstyle.explain",
  ];
  const relevant = rows.filter(
    (r) => playEvents.includes(r.event_name) || r.event_name === "playstyle.explain",
  );
  const bySession = new Map<string, CostAuditAdminRow[]>();
  for (const r of relevant) {
    const sid = r.correlation_id || r.session_id || "";
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid)!.push(r);
  }
  const flows = [...bySession.entries()]
    .map(([session_id, evs]) => {
      const sorted = [...evs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      return { session_id, events: sorted, count: sorted.length };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limitSessions);
  return flows;
}

export function computeDataQuality(rows: CostAuditAdminRow[]) {
  let missingRequestId = 0;
  let missingSessionId = 0;
  let missingDurationWherePlaystyleClientDone = 0;
  for (const r of rows) {
    if (!r.request_id && r.source === "server" && r.route?.startsWith("/api")) missingRequestId++;
    if (!r.session_id && !r.correlation_id && r.source === "client") missingSessionId++;
    if (
      r.event_name === "client.playstyle.explain_fetch_done" &&
      r.duration_ms == null &&
      r.meta?.durationMs == null
    ) {
      missingDurationWherePlaystyleClientDone++;
    }
  }
  return {
    missingRequestId,
    missingSessionId,
    missingDurationWherePlaystyleClientDone,
    totalRows: rows.length,
  };
}

export function computeSuspiciousPatterns(input: {
  rows: CostAuditAdminRow[];
  playstyleClient: { effect: number; start: number; done: number };
  serverPlaystyle: number;
  clientTotal: number;
  serverTotal: number;
  topCacheKeyRepeats: { cache_key: string; count: number }[];
}) {
  const { rows, playstyleClient, serverPlaystyle, clientTotal, serverTotal, topCacheKeyRepeats } =
    input;
  const messages: { level: "warn" | "bad"; text: string }[] = [];
  if (playstyleClient.done > playstyleClient.start) {
    messages.push({
      level: "bad",
      text: `Playstyle client fetch_done (${playstyleClient.done}) > fetch_start (${playstyleClient.start}) — often sampling skew (fixed in ingest) or aborted/restarted fetches.`,
    });
  }
  if (playstyleClient.effect > playstyleClient.start + 5) {
    messages.push({
      level: "warn",
      text: `Many explain_effect (${playstyleClient.effect}) vs fetch_start (${playstyleClient.start}) — effects re-running without new fetches (loading gates) or duplicate mounts.`,
    });
  }
  if (clientTotal > 0 && serverTotal > 0 && clientTotal > serverTotal * 3) {
    messages.push({
      level: "warn",
      text: `Client events (${clientTotal}) >> server (${serverTotal}) — expected (3+ client logs per HTTP call for playstyle); plus client-only routes.`,
    });
  }
  const pc = playstyleClient.effect + playstyleClient.start + playstyleClient.done;
  if (serverPlaystyle > 0 && pc > serverPlaystyle * 4) {
    messages.push({
      level: "warn",
      text: `Playstyle client triad sum (~${pc}) high vs server playstyle.explain (${serverPlaystyle}) — multiple client telemetry lines per request + cache hits still log client done.`,
    });
  }
  const top = topCacheKeyRepeats[0];
  if (top && top.count >= 20) {
    messages.push({
      level: "warn",
      text: `Cache key repeated ${top.count}× — duplicate requests or stable quiz fingerprint (inspect flows).`,
    });
  }

  const sessionBursts = topSessionVolumes(rows, 8);
  for (const s of sessionBursts) {
    if (s.events >= 24) {
      messages.push({
        level: "bad",
        text: `Session / correlation ${String(s.session_id).slice(0, 12)}… had ${s.events} events in window — possible UI loop or Strict Mode double-mount in dev.`,
      });
      break;
    }
  }

  if (!countEv(rows, "shout.stream.open") && !countEv(rows, "shout.stream.close")) {
    messages.push({
      level: "warn",
      text: "No shout stream events in window — homepage/shout not visited or DB flags off for server.",
    });
  }

  return messages;
}

export function computePlaystyleDeepDive(rows: CostAuditAdminRow[]) {
  const client = rows.filter((r) => r.source === "client");
  const effect = countEv(client, "client.playstyle.explain_effect");
  const start = countEv(client, "client.playstyle.explain_fetch_start");
  const done = countEv(client, "client.playstyle.explain_fetch_done");
  const serverN = countEv(rows, "playstyle.explain");
  const serverRows = rows.filter((r) => r.event_name === "playstyle.explain");
  const cacheKnown = serverRows.filter((r) => r.cache_hit !== null);
  const cacheHitRate =
    cacheKnown.length === 0
      ? null
      : cacheKnown.filter((r) => r.cache_hit === true).length / cacheKnown.length;

  const sourceBreakdown: Record<string, number> = {};
  for (const r of serverRows) {
    const k = r.source_detail || "(none)";
    sourceBreakdown[k] = (sourceBreakdown[k] ?? 0) + 1;
  }

  const cacheKeyCounts = new Map<string, number>();
  for (const r of serverRows) {
    if (!r.cache_key) continue;
    cacheKeyCounts.set(r.cache_key, (cacheKeyCounts.get(r.cache_key) ?? 0) + 1);
  }
  const topCacheKeys = [...cacheKeyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([cache_key, count]) => ({ cache_key, count }));

  const profileLabels = new Map<string, number>();
  for (const r of client) {
    if (!r.event_name.startsWith("client.playstyle")) continue;
    const len = metaNum(r, "profileLabelLen");
    const key = len != null ? `labelLen:${len}` : "(no label len)";
    profileLabels.set(key, (profileLabels.get(key) ?? 0) + 1);
  }
  const topProfileLabels = [...profileLabels.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  const byComp = new Map<string, number>();
  for (const r of client) {
    if (!r.event_name.includes("playstyle")) continue;
    const c = r.component || metaStr(r, "component") || "?";
    byComp.set(c, (byComp.get(c) ?? 0) + 1);
  }
  const componentBurst = [...byComp.entries()]
    .map(([component, events]) => ({ component, events }))
    .sort((a, b) => b.events - a.events);

  const playstyleTable = rows
    .filter(
      (r) =>
        r.event_name.startsWith("client.playstyle") || r.event_name === "playstyle.explain",
    )
    .slice(0, 80)
    .map((r) => ({
      created_at: r.created_at,
      event_name: r.event_name,
      source: r.source,
      session_id: r.session_id,
      correlation_id: r.correlation_id,
      request_id: r.request_id,
      attempt: metaNum(r, "attempt"),
      level: metaStr(r, "level"),
      cache_hit: r.cache_hit,
      source_detail: r.source_detail,
      duration_ms: r.duration_ms,
      success: r.success,
      status_code: r.status_code ?? metaNum(r, "status"),
      component: r.component,
      pathname: r.pathname,
      metaPreview: summarizeSmall(r.meta),
    }));

  return {
    effect,
    start,
    done,
    serverCount: serverN,
    doneOverStart: start > 0 ? done / start : null,
    effectOverStart: start > 0 ? effect / start : null,
    clientOverServer: serverN > 0 ? (effect + start + done) / serverN : null,
    cacheHitRate,
    sourceBreakdown,
    topCacheKeys,
    topProfileLabels,
    componentBurst,
    flows: playstyleFlowGroups(rows, 12),
    recentTable: playstyleTable,
  };
}

function summarizeSmall(meta: Record<string, unknown>) {
  const keys = Object.keys(meta || {}).slice(0, 6);
  const o: Record<string, unknown> = {};
  for (const k of keys) o[k] = meta[k];
  return o;
}

export function computeExtendedSummary(rows: CostAuditAdminRow[]) {
  const serverRows = rows.filter((r) => r.source === "server");
  const clientRows = rows.filter((r) => r.source === "client");
  const playstyleClient = {
    effect: countEv(clientRows, "client.playstyle.explain_effect"),
    start: countEv(clientRows, "client.playstyle.explain_fetch_start"),
    done: countEv(clientRows, "client.playstyle.explain_fetch_done"),
  };
  const serverPlaystyle = countEv(rows, "playstyle.explain");

  const topCacheKeyRepeats = (() => {
    const serverRowsP = rows.filter((r) => r.event_name === "playstyle.explain");
    const cacheKeyCounts = new Map<string, number>();
    for (const r of serverRowsP) {
      if (!r.cache_key) continue;
      cacheKeyCounts.set(r.cache_key, (cacheKeyCounts.get(r.cache_key) ?? 0) + 1);
    }
    return [...cacheKeyCounts.entries()]
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cache_key, count]) => ({ cache_key, count }));
  })();

  return {
    totalEvents: rows.length,
    serverEvents: serverRows.length,
    clientEvents: clientRows.length,
    uniqueRequestIds: uniq(rows, "request_id"),
    uniqueSessionIds: uniq(rows, "session_id"),
    uniqueCorrelationIds: uniq(rows, "correlation_id" as keyof CostAuditAdminRow),
    uniqueUserIds: uniq(rows, "user_id"),
    playstyleClient,
    serverPlaystyleExplain: serverPlaystyle,
    ratioDoneStart: playstyleClient.start > 0 ? playstyleClient.done / playstyleClient.start : null,
    ratioEffectStart:
      playstyleClient.start > 0 ? playstyleClient.effect / playstyleClient.start : null,
    ratioClientServer:
      serverRows.length > 0 ? clientRows.length / serverRows.length : null,
    homepageRenders: countEv(rows, "page.render"),
    shoutOpens: countEv(rows, "shout.stream.open"),
    shoutCloses: countEv(rows, "shout.stream.close"),
    priceGet: rows.filter((r) => r.event_name === "price.request" && r.method === "GET").length,
    pricePost: rows.filter((r) => r.event_name === "price.request" && r.method === "POST").length,
    fuzzy: countEv(rows, "fuzzy.request"),
    collections: countEv(rows, "collections.cards"),
    comments: countEv(rows, "deck.comments"),
    suspicious: computeSuspiciousPatterns({
      rows,
      playstyleClient,
      serverPlaystyle,
      clientTotal: clientRows.length,
      serverTotal: serverRows.length,
      topCacheKeyRepeats,
    }),
    bursts: computeBurstBuckets(rows, [10, 30, 60]),
    topSessions: topSessionVolumes(rows, 15),
    topDupRequestIds: topDuplicateRequestIds(rows, 15),
    topComponents: topComponents(rows, 12),
    topCacheKeyRepeats,
    dataQuality: computeDataQuality(rows),
    playstyle: computePlaystyleDeepDive(rows),
  };
}
