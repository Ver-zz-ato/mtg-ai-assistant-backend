/**
 * Request metrics for billing forensics and cost attribution.
 *
 * Emits structured JSON logs and (optionally) PostHog events to attribute
 * Vercel costs to routes, callers, and patterns.
 *
 * Sampling: 1% baseline + 100% for slow (>2s) / large (>100KB) / errors.
 */

import { isBot } from '@/lib/analytics/middleware-helpers';

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const BASELINE_SAMPLE_RATE = 0.01;
const SLOW_THRESHOLD_MS = 2000;
const LARGE_RESPONSE_BYTES = 100 * 1024;
const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestMetricsContext {
  request_id: string;
  route: string;
  method: string;
  status: number;
  duration_ms: number;
  bytes_out?: number;
  bytes_in?: number;
  cache_hit?: boolean;
  region?: string;
  runtime: 'nodejs' | 'edge';
  cold_start?: boolean;
  user_agent?: string;
  referer?: string;
  ip_prefix?: string;
  user_id?: string;
  bot_flag: boolean;
  caller_type?: 'cron' | 'health_check' | 'bot' | 'user' | 'unknown';
}

function hashIp(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  // Use first 2 octets for IPv4, or first 4 chars for IPv6 - enough for attribution, not PII
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}.x.x` : 'unknown';
  }
  return ip.slice(0, 8) + '...';
}

function getCallerType(req: {
  headers: { get: (n: string) => string | null };
}): RequestMetricsContext['caller_type'] {
  const ua = req.headers.get('user-agent') || '';
  const cronKey = req.headers.get('x-cron-key');
  const vercelId = req.headers.get('x-vercel-id');
  if (cronKey || vercelId) return 'cron';
  if (/healthcheck|uptimerobot|pingdom|statuscake|freshping/i.test(ua)) return 'health_check';
  if (isBot(ua)) return 'bot';
  return 'user';
}

export function getOrCreateRequestId(req: { headers: { get: (n: string) => string | null } }): string {
  const existing = req.headers.get(REQUEST_ID_HEADER);
  if (existing) return existing;
  return randomId();
}

export function shouldSample(context: Partial<RequestMetricsContext>): boolean {
  if (context.status && context.status >= 400) return true;
  if ((context.duration_ms ?? 0) >= SLOW_THRESHOLD_MS) return true;
  if ((context.bytes_out ?? 0) >= LARGE_RESPONSE_BYTES) return true;
  return Math.random() < BASELINE_SAMPLE_RATE;
}

export function buildMetricsContext(
  req: {
    url: string;
    method: string;
    headers: { get: (n: string) => string | null };
  },
  overrides: Partial<RequestMetricsContext> = {}
): RequestMetricsContext {
  const url = new URL(req.url);
  const path = url.pathname;
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
  const ua = req.headers.get('user-agent') || '';

  return {
    request_id: overrides.request_id ?? getOrCreateRequestId(req),
    route: path,
    method: req.method.toUpperCase(),
    status: overrides.status ?? 0,
    duration_ms: overrides.duration_ms ?? 0,
    bytes_out: overrides.bytes_out,
    bytes_in: overrides.bytes_in,
    cache_hit: overrides.cache_hit,
    region: process.env.VERCEL_REGION ?? overrides.region,
    runtime: (process.env.VERCEL_RUNTIME as 'nodejs' | 'edge') ?? 'nodejs',
    cold_start: overrides.cold_start,
    user_agent: ua.slice(0, 200),
    referer: req.headers.get('referer')?.slice(0, 200) ?? undefined,
    ip_prefix: hashIp(ip),
    user_id: overrides.user_id,
    bot_flag: isBot(ua),
    caller_type: getCallerType(req),
    ...overrides,
  };
}

export function logRequestMetrics(context: RequestMetricsContext): void {
  const payload = {
    ts: new Date().toISOString(),
    type: 'api_request',
    ...context,
  };
  console.log(JSON.stringify(payload));
}

export function emitPostHogApiRequest(
  captureServer: (event: string, props: Record<string, unknown>, distinctId?: string) => Promise<void>,
  context: RequestMetricsContext
): void {
  if (!shouldSample(context)) return;
  captureServer('api_request', {
    route: context.route,
    method: context.method,
    status: context.status,
    duration_ms: context.duration_ms,
    bytes_out: context.bytes_out,
    bot_flag: context.bot_flag,
    caller_type: context.caller_type,
    request_id: context.request_id,
  }, context.user_id ?? `ip:${context.ip_prefix}`).catch(() => {});
}

// Rate-limit warning logs to avoid spam (max 1 warning per minute)
let lastPersistWarningTime = 0;
const PERSIST_WARNING_INTERVAL_MS = 60_000;

/**
 * Persist request metrics to Supabase for admin dashboard.
 * 
 * IMPORTANT: This function is designed to be BEST-EFFORT and NON-BLOCKING:
 * - Uses a timeout (default 200ms) to prevent inflating function duration/cost
 * - Swallows all errors silently (with rate-limited warnings in dev)
 * - Should be called with .catch(() => {}) or via persistRequestMetricsBestEffort()
 * 
 * Why: Vercel charges for function duration. If DB persistence takes 500ms,
 * that's 500ms added to every sampled request's bill. We cap at 200ms to
 * avoid this while still capturing most metrics (DB writes are usually <50ms).
 */
async function persistRequestMetricsInternal(
  context: RequestMetricsContext,
  timeoutMs: number
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url}/rest/v1/request_metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        route: context.route,
        method: context.method,
        status: context.status,
        duration_ms: context.duration_ms,
        bytes_in: context.bytes_in ?? null,
        bytes_out: context.bytes_out ?? null,
        bot_flag: context.bot_flag,
        caller_type: context.caller_type ?? null,
        user_agent: context.user_agent?.slice(0, 500) ?? null,
        runtime: context.runtime,
        region: context.region ?? null,
        cache_status: context.cache_hit !== undefined ? (context.cache_hit ? 'HIT' : 'MISS') : null,
        request_id: context.request_id,
        ip_prefix: context.ip_prefix ?? null,
      }),
      signal: controller.signal,
    });
    if (!response.ok && process.env.NODE_ENV === 'development') {
      const now = Date.now();
      if (now - lastPersistWarningTime > PERSIST_WARNING_INTERVAL_MS) {
        lastPersistWarningTime = now;
        console.warn('[requestMetrics] persist failed:', response.status);
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Best-effort, non-blocking persistence for request metrics.
 * 
 * Call this instead of persistRequestMetrics() when you want fire-and-forget behavior.
 * - Only runs when BILLING_METRICS_PERSIST=1
 * - Never blocks: returns immediately, persistence happens in background
 * - Times out after 200ms to avoid inflating function duration
 * - Swallows all errors (rate-limited warnings in dev)
 */
export function persistRequestMetricsBestEffort(context: RequestMetricsContext): void {
  if (process.env.BILLING_METRICS_PERSIST !== '1') return;
  
  const timeoutMs = parseInt(process.env.BILLING_METRICS_TIMEOUT_MS || '200', 10);
  
  // Fire and forget - do not await
  persistRequestMetricsInternal(context, timeoutMs).catch(() => {
    // Silently ignore all errors (timeout, network, etc.)
    // Rate-limited warnings are handled inside persistRequestMetricsInternal
  });
}

/**
 * @deprecated Use persistRequestMetricsBestEffort() instead for non-blocking behavior.
 * This function is kept for backwards compatibility but should not be awaited.
 */
export async function persistRequestMetrics(context: RequestMetricsContext): Promise<void> {
  if (process.env.BILLING_METRICS_PERSIST !== '1') return;
  
  const timeoutMs = parseInt(process.env.BILLING_METRICS_TIMEOUT_MS || '200', 10);
  
  try {
    await persistRequestMetricsInternal(context, timeoutMs);
  } catch {
    // Silently fail - don't block request
  }
}
