/**
 * Higher-order function to wrap API route handlers with request metrics.
 *
 * Logs: route, method, status, duration, response size, bot flag, caller type.
 * Uses sampling: 1% baseline + 100% for slow/large/error responses.
 *
 * Usage:
 *   export const GET = withMetrics(async (req) => { ... });
 *   export const POST = withMetrics(async (req) => { ... });
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  buildMetricsContext,
  logRequestMetrics,
  emitPostHogApiRequest,
  shouldSample,
  getOrCreateRequestId,
  persistRequestMetricsBestEffort,
} from './requestMetrics';

// Type that works with Next.js 15 route handlers (with or without params)
type RouteHandler = (
  req: NextRequest,
  context?: unknown
) => Promise<NextResponse> | NextResponse;

export function withMetrics<T extends RouteHandler>(handler: T): T {
  const wrapped = async (req: NextRequest, context?: unknown) => {
    const requestId = getOrCreateRequestId(req);
    const start = Date.now();
    let response: NextResponse;

    try {
      response = await handler(req, context);
    } catch (err) {
      const duration = Date.now() - start;
      const ctx = buildMetricsContext(req, {
        request_id: requestId,
        status: 500,
        duration_ms: duration,
        cold_start: undefined, // Vercel doesn't expose this easily
      });
      if (shouldSample(ctx)) {
        logRequestMetrics(ctx);
        persistRequestMetricsBestEffort(ctx); // Non-blocking, fire-and-forget
        try {
          const { captureServer } = await import('@/lib/server/analytics');
          emitPostHogApiRequest(captureServer, ctx);
        } catch { /* PostHog not available on Edge */ }
      }
      throw err;
    }

    const duration = Date.now() - start;
    const status = response.status;

    // bytes_out: use Content-Length header if set; otherwise omit (avoids consuming streaming body)
    const contentLength = response.headers.get('content-length');
    const bytesOut = contentLength ? parseInt(contentLength, 10) : undefined;

    const metricsContext = buildMetricsContext(req, {
      request_id: requestId,
      status,
      duration_ms: duration,
      bytes_out: bytesOut,
    });

    if (shouldSample(metricsContext)) {
      logRequestMetrics(metricsContext);
      persistRequestMetricsBestEffort(metricsContext); // Non-blocking, fire-and-forget
      try {
        const { captureServer } = await import('@/lib/server/analytics');
        emitPostHogApiRequest(captureServer, metricsContext);
      } catch { /* PostHog not available on Edge */ }
    }

    // Add request_id to response headers for tracing
    response.headers.set('x-request-id', requestId);

    return response;
  };
  return wrapped as T;
}
