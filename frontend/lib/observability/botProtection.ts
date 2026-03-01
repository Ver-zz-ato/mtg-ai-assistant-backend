/**
 * Bot protection and rate limiting for API routes.
 *
 * All protections are behind env flags - set to enable:
 *   BILLING_GUARD_BOT_BLOCK=1     - Return 403 for bots on selected API routes
 *   BILLING_GUARD_RATE_LIMIT=1    - Apply stricter rate limits to noisiest endpoints
 *   BILLING_GUARD_POLL_THROTTLE=1 - Throttle high-frequency polling endpoints
 *
 * Safe to enable/disable without code changes.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isBot } from '@/lib/analytics/middleware-helpers';

const BOT_BLOCK_ENABLED = process.env.BILLING_GUARD_BOT_BLOCK === '1';
const RATE_LIMIT_ENABLED = process.env.BILLING_GUARD_RATE_LIMIT === '1';
const POLL_THROTTLE_ENABLED = process.env.BILLING_GUARD_POLL_THROTTLE === '1';

// In-memory store for poll throttle (per-IP, per-route)
const pollStore = new Map<string, { count: number; resetAt: number }>();
const POLL_WINDOW_MS = 60_000; // 1 minute
const POLL_MAX_PER_WINDOW = 10; // e.g. /api/stats/activity at 60s = 1/min; 10 allows some burst

// Routes that bots commonly hit and we can safely block
const BOT_BLOCK_ROUTES = [
  '/api/config',
  '/api/stats/activity',
  '/api/rate-limit/status',
  '/api/health',
  '/api/changelog',
];

// Routes with aggressive polling - throttle when guard enabled
const POLL_THROTTLE_ROUTES = ['/api/stats/activity', '/api/rate-limit/status'];

// Stricter rate limits when BILLING_GUARD_RATE_LIMIT=1 (requests per minute per IP)
const GUARD_RATE_LIMITS: Record<string, number> = {
  '/api/config': 120,
  '/api/stats/activity': 10,
  '/api/rate-limit/status': 10,
  '/api/changelog': 30,
};

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
}

function getPollKey(req: NextRequest, path: string): string {
  return `${getIp(req)}:${path}`;
}

export function checkBotBlock(req: NextRequest, path: string): NextResponse | null {
  if (!BOT_BLOCK_ENABLED) return null;
  const ua = req.headers.get('user-agent') || '';
  if (!isBot(ua)) return null;

  const isBlockedRoute = BOT_BLOCK_ROUTES.some((r) => path === r || path.startsWith(r + '/'));
  if (!isBlockedRoute) return null;

  return NextResponse.json(
    { ok: false, error: 'Forbidden', message: 'Bot access not allowed' },
    { status: 403 }
  );
}

export function checkPollThrottle(req: NextRequest, path: string): NextResponse | null {
  if (!POLL_THROTTLE_ENABLED) return null;
  if (!POLL_THROTTLE_ROUTES.includes(path)) return null;

  const key = getPollKey(req, path);
  const now = Date.now();
  let record = pollStore.get(key);

  if (!record || record.resetAt < now) {
    record = { count: 0, resetAt: now + POLL_WINDOW_MS };
    pollStore.set(key, record);
  }
  record.count++;

  if (record.count > POLL_MAX_PER_WINDOW) {
    return NextResponse.json(
      { ok: false, error: 'Too Many Requests', retryAfter: 60 },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  return null;
}

// Stricter rate limit store (per-IP per-route per-minute)
const guardRateStore = new Map<string, { count: number; resetAt: number }>();

export function checkGuardRateLimit(req: NextRequest, path: string): NextResponse | null {
  if (!RATE_LIMIT_ENABLED) return null;

  const limit = GUARD_RATE_LIMITS[path];
  if (!limit) return null;

  const ip = getIp(req);
  const key = `${ip}:${path}`;
  const now = Date.now();
  const windowMs = 60_000;

  let record = guardRateStore.get(key);
  if (!record || record.resetAt < now) {
    record = { count: 0, resetAt: now + windowMs };
    guardRateStore.set(key, record);
  }
  record.count++;

  if (record.count > limit) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }
  return null;
}

/**
 * Run all billing guards. Returns a 403/429 response if any guard triggers, else null.
 */
export function runBillingGuards(req: NextRequest, path: string): NextResponse | null {
  const block = checkBotBlock(req, path);
  if (block) return block;

  const throttle = checkPollThrottle(req, path);
  if (throttle) return throttle;

  const rateLimit = checkGuardRateLimit(req, path);
  if (rateLimit) return rateLimit;

  return null;
}
