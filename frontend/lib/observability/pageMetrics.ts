/**
 * Page (non-API) request metrics for billing forensics.
 * 
 * Logs sampled non-API requests to help identify cost drivers from:
 * - Page renders (RSC/SSR)
 * - Image optimization (/_next/image)
 * - ISR pages (/decks, /wishlist, /meta, /cards, /blog)
 * 
 * Sampling strategy:
 * - Default: 0.1% baseline (configurable via BILLING_PAGE_SAMPLING)
 * - 100% for high-interest paths (configurable via BILLING_PAGE_ALWAYS_LOG_PATHS)
 * 
 * Output: JSON logs to stdout with type:"request" (vs type:"api_request" for API routes)
 */

import { isBot } from '@/lib/analytics/middleware-helpers';

// Default sampling rate for non-API requests (0.1%)
const DEFAULT_PAGE_SAMPLING = 0.001;

// Default high-interest paths that are always logged (100% sampling)
const DEFAULT_ALWAYS_LOG_PATHS = [
  '/_next/image',
  '/_next/data',
  '/decks',
  '/wishlist',
  '/meta',
  '/cards',
  '/blog',
];

export interface PageMetricsContext {
  request_id: string;
  path: string;
  method: string;
  status: number | null; // null if we can't determine status in middleware
  duration_ms: number;
  runtime: 'middleware';
  user_agent?: string;
  referer?: string;
  bot_flag: boolean;
  ip_prefix?: string;
  cache_status?: string;
}

function getPageSamplingRate(): number {
  const env = process.env.BILLING_PAGE_SAMPLING;
  if (!env) return DEFAULT_PAGE_SAMPLING;
  const parsed = parseFloat(env);
  return isNaN(parsed) ? DEFAULT_PAGE_SAMPLING : Math.max(0, Math.min(1, parsed));
}

function getAlwaysLogPaths(): string[] {
  const env = process.env.BILLING_PAGE_ALWAYS_LOG_PATHS;
  if (!env) return DEFAULT_ALWAYS_LOG_PATHS;
  return env.split(',').map(p => p.trim()).filter(Boolean);
}

function hashIp(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}.x.x` : 'unknown';
  }
  return ip.slice(0, 8) + '...';
}

/**
 * Determine if a non-API request should be sampled for logging.
 * 
 * - Always sample high-interest paths (/_next/image, /decks, etc.)
 * - Otherwise use baseline sampling rate
 */
export function shouldSamplePageRequest(path: string): boolean {
  const alwaysLogPaths = getAlwaysLogPaths();
  
  // Check if path matches any high-interest patterns
  for (const pattern of alwaysLogPaths) {
    if (path.startsWith(pattern)) {
      return true;
    }
  }
  
  // Baseline sampling
  return Math.random() < getPageSamplingRate();
}

/**
 * Build page metrics context from a request.
 */
export function buildPageMetricsContext(
  req: {
    url: string;
    method: string;
    headers: { get: (n: string) => string | null };
  },
  overrides: Partial<PageMetricsContext> = {}
): PageMetricsContext {
  const url = new URL(req.url);
  const path = url.pathname;
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
  const ua = req.headers.get('user-agent') || '';

  return {
    request_id: overrides.request_id ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    path,
    method: req.method.toUpperCase(),
    status: overrides.status ?? null,
    duration_ms: overrides.duration_ms ?? 0,
    runtime: 'middleware',
    user_agent: ua.slice(0, 200),
    referer: req.headers.get('referer')?.slice(0, 200) ?? undefined,
    bot_flag: isBot(ua),
    ip_prefix: hashIp(ip),
    cache_status: req.headers.get('x-vercel-cache') ?? undefined,
    ...overrides,
  };
}

/**
 * Log page request metrics to stdout as JSON.
 * 
 * Output format matches API request logs but with type:"request" instead of type:"api_request".
 */
export function logPageMetrics(context: PageMetricsContext): void {
  const payload = {
    ts: new Date().toISOString(),
    type: 'request', // Different from 'api_request' for API routes
    ...context,
  };
  console.log(JSON.stringify(payload));
}
