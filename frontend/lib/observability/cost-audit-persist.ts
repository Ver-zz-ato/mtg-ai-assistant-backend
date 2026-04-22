import { getAdmin } from "@/app/api/_lib/supa";
import { costAuditSafeErr } from "@/lib/observability/cost-audit";

const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "token",
  "apikey",
  "api_key",
  "secret",
  "openai_api_key",
]);

/** Log fields already mapped to columns — omit from meta JSON. */
const COLUMN_META_EXCLUDE = new Set([
  "ts",
  "event",
  "event_name",
  "route",
  "method",
  "reqId",
  "session",
  "userId",
  "isAnonymous",
  "durationMs",
  "ok",
  "err",
  "cacheHit",
  "priceCacheHit",
  "cacheKey",
  "source",
  "namesCount",
  "messageCount",
  "commentCount",
  "itemCount",
  "pingSent",
  "uniqueNamesCount",
  "archetypeCount",
  "avoidCount",
  "scryfallHttpCalls",
  "cacheHitCount",
  "adminLookupCount",
  "missingCount",
  "cacheMissCount",
  "rawCount",
]);

export function isCostAuditDbPersistEnabled(): boolean {
  return process.env.VERCEL_COST_AUDIT_DB === "1";
}

function sampleAllows(): boolean {
  const raw = process.env.VERCEL_COST_AUDIT_SAMPLE_RATE;
  if (raw == null || raw === "") return true;
  const r = parseFloat(raw);
  const rate = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 1;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

function pickInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Math.round(Number(v));
  return null;
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function sanitizeMetaValue(v: unknown, depth: number): unknown {
  if (depth > 3) return "[deep]";
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return truncateStr(v, 400);
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 25).map((x) => sanitizeMetaValue(x, depth + 1));
  if (typeof v === "object") return sanitizeMetaObject(v as Record<string, unknown>, depth + 1);
  return String(v).slice(0, 200);
}

function sanitizeMetaObject(obj: Record<string, unknown>, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) continue;
    if (COLUMN_META_EXCLUDE.has(k)) continue;
    out[k] = sanitizeMetaValue(v, depth);
  }
  return out;
}

export function buildCostAuditInsertRow(
  source: "server" | "client",
  line: Record<string, unknown>,
): Record<string, unknown> {
  const eventName = String(line.event ?? line.event_name ?? "unknown").slice(0, 200);
  const route = line.route != null ? String(line.route).slice(0, 500) : null;
  const method = line.method != null ? String(line.method).slice(0, 32) : null;
  const requestId = line.reqId != null ? String(line.reqId).slice(0, 80) : null;
  const sessionId = line.session != null ? String(line.session).slice(0, 80) : null;
  const userId = line.userId != null ? String(line.userId).slice(0, 80) : null;
  const isAnonymous = typeof line.isAnonymous === "boolean" ? line.isAnonymous : null;
  const durationMs = pickInt(line.durationMs);
  const success = typeof line.ok === "boolean" ? line.ok : null;
  const errorCode = line.err != null ? truncateStr(String(line.err), 500) : null;

  let cacheHit: boolean | null = null;
  if (typeof line.cacheHit === "boolean") cacheHit = line.cacheHit;
  else if (typeof line.priceCacheHit === "boolean") cacheHit = line.priceCacheHit;

  const cacheKey = line.cacheKey != null ? truncateStr(String(line.cacheKey), 500) : null;
  const sourceDetail = line.source != null ? truncateStr(String(line.source), 200) : null;

  const count1 = pickInt(
    line.namesCount ??
      line.messageCount ??
      line.commentCount ??
      line.itemCount ??
      line.pingSent ??
      line.uniqueNamesCount ??
      line.archetypeCount,
  );
  const count2 = pickInt(
    line.scryfallHttpCalls ?? line.cacheHitCount ?? line.adminLookupCount ?? line.missingCount ?? line.avoidCount,
  );
  const count3 = pickInt(line.cacheMissCount ?? line.rawCount);

  const meta = sanitizeMetaObject(line, 0);

  return {
    source,
    event_name: eventName,
    route,
    method,
    request_id: requestId,
    session_id: sessionId,
    user_id: userId,
    is_anonymous: isAnonymous,
    duration_ms: durationMs,
    success,
    error_code: errorCode,
    cache_hit: cacheHit,
    cache_key: cacheKey,
    source_detail: sourceDetail,
    count_1: count1,
    count_2: count2,
    count_3: count3,
    meta,
  };
}

let persistWarned = false;

export function persistCostAuditEventAsync(source: "server" | "client", line: Record<string, unknown>): void {
  if (!isCostAuditDbPersistEnabled() || !sampleAllows()) return;
  void persistCostAuditEvent(source, line).catch((e) => {
    if (!persistWarned) {
      persistWarned = true;
      console.warn("[CostAudit] db persist failed (further warnings suppressed):", costAuditSafeErr(e));
    }
  });
}

async function insertCostAuditRows(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length) return;
  const admin = getAdmin();
  if (!admin) return;
  const { error } = await admin.from("observability_cost_events").insert(rows as any);
  if (error) throw error;
}

/** Single row; sampling applied by caller or use persistCostAuditEventAsync. */
export async function persistCostAuditEvent(
  source: "server" | "client",
  line: Record<string, unknown>,
): Promise<void> {
  if (!isCostAuditDbPersistEnabled()) return;
  await insertCostAuditRows([buildCostAuditInsertRow(source, line)]);
}

export async function persistCostAuditEventsBatch(
  source: "server" | "client",
  lines: Record<string, unknown>[],
): Promise<void> {
  if (!isCostAuditDbPersistEnabled() || !lines.length) return;
  const picked = lines.filter(() => sampleAllows());
  if (!picked.length) return;
  await insertCostAuditRows(picked.map((line) => buildCostAuditInsertRow(source, line)));
}
