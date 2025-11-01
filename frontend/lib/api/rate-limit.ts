// lib/api/rate-limit.ts
import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
}

interface RateLimitStore {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting (use Redis in production for distributed systems)
const store = new Map<string, RateLimitStore>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.resetTime < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Get rate limit tier based on user status
 */
export function getRateLimitTier(isPro: boolean): RateLimitConfig {
  if (isPro) {
    return {
      windowMs: 60 * 60 * 1000, // 1 hour
      maxRequests: 1000,
    };
  }
  
  return {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 100,
  };
}

/**
 * Generate a unique key for rate limiting
 */
function generateKey(req: NextRequest, userId?: string): string {
  // Use user ID if available, otherwise fall back to IP
  if (userId) {
    return `user:${userId}`;
  }
  
  // Get IP from headers
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
              req.headers.get('x-real-ip') || 
              'unknown';
  
  return `ip:${ip}`;
}

/**
 * Check if request is rate limited
 */
export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  userId?: string
): {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
} {
  const key = config.keyGenerator ? config.keyGenerator(req) : generateKey(req, userId);
  const now = Date.now();
  
  let record = store.get(key);
  
  // Create new record if doesn't exist or expired
  if (!record || record.resetTime < now) {
    record = {
      count: 0,
      resetTime: now + config.windowMs,
    };
    store.set(key, record);
  }
  
  // Increment count
  record.count++;
  
  const allowed = record.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - record.count);
  const reset = Math.floor(record.resetTime / 1000); // Unix timestamp in seconds
  
  return {
    allowed,
    limit: config.maxRequests,
    remaining,
    reset,
    retryAfter: allowed ? undefined : Math.ceil((record.resetTime - now) / 1000),
  };
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  rateLimit: ReturnType<typeof checkRateLimit>
): NextResponse {
  response.headers.set('X-RateLimit-Limit', rateLimit.limit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  response.headers.set('X-RateLimit-Reset', rateLimit.reset.toString());
  
  if (!rateLimit.allowed && rateLimit.retryAfter) {
    response.headers.set('Retry-After', rateLimit.retryAfter.toString());
  }
  
  return response;
}

/**
 * Rate limit middleware wrapper for API routes
 */
export async function withRateLimit<T>(
  req: NextRequest,
  handler: () => Promise<T>,
  options?: {
    config?: RateLimitConfig;
    userId?: string;
    isPro?: boolean;
  }
): Promise<NextResponse> {
  const config = options?.config || getRateLimitTier(options?.isPro || false);
  const rateLimit = checkRateLimit(req, config, options?.userId);
  
  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      {
        ok: false,
        error: 'Rate limit exceeded',
        retryAfter: rateLimit.retryAfter,
      },
      { status: 429 }
    );
    
    return addRateLimitHeaders(response, rateLimit);
  }
  
  try {
    const result = await handler();
    const response = NextResponse.json(result);
    return addRateLimitHeaders(response, rateLimit);
  } catch (error: any) {
    const response = NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
    return addRateLimitHeaders(response, rateLimit);
  }
}

/**
 * Get current rate limit status for a user
 */
export function getRateLimitStatus(req: NextRequest, userId?: string, isPro: boolean = false): {
  limit: number;
  remaining: number;
  reset: number;
  percentUsed: number;
} {
  const config = getRateLimitTier(isPro);
  const key = generateKey(req, userId);
  const now = Date.now();
  
  const record = store.get(key);
  
  if (!record || record.resetTime < now) {
    return {
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: Math.floor((now + config.windowMs) / 1000),
      percentUsed: 0,
    };
  }
  
  const remaining = Math.max(0, config.maxRequests - record.count);
  const percentUsed = Math.round((record.count / config.maxRequests) * 100);
  
  return {
    limit: config.maxRequests,
    remaining,
    reset: Math.floor(record.resetTime / 1000),
    percentUsed,
  };
}


















































