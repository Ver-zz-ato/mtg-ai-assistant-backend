// app/api/stats/activity/log/route.ts
import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { validateOrigin } from "@/lib/api/csrf";
import { extractIP } from "@/lib/guest-tracking";

const MAX_ACTIVITIES = 50;
const ACTIVITY_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_MESSAGE_LENGTH = 200;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ActivityItem {
  type: string;
  message: string;
  timestamp: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req, "/api/stats/activity/log")) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const burst = checkRateLimit(req, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 30,
      keyGenerator: (request) => `activity-log:${extractIP(request)}`,
    });
    if (!burst.allowed) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 }),
        burst,
      );
    }

    const body = await req.json().catch(() => ({}));
    const { type, message } = body;

    if (!type || !message) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: 'type and message required' }, { status: 400 }),
        burst,
      );
    }

    const cleanType = typeof type === "string" ? type.trim().slice(0, 50) : "";
    const cleanMessage = typeof message === "string" ? message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
    if (!cleanType || !cleanMessage) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "invalid_activity_payload" }, { status: 400 }),
        burst,
      );
    }

    // Get existing activities from cache
    const cacheKey = 'activity_log';
    const existing: ActivityItem[] = memoGet<ActivityItem[]>(cacheKey) || [];

    // Create new activity
    const newActivity: ActivityItem = {
      type: cleanType,
      message: cleanMessage,
      timestamp: new Date().toISOString(),
    };

    // Add to front of array
    const updated = [newActivity, ...existing]
      .slice(0, MAX_ACTIVITIES) // Keep only last 50
      .filter(a => {
        // Remove activities older than 24 hours
        const age = Date.now() - new Date(a.timestamp).getTime();
        return age < ACTIVITY_TTL;
      });

    // Save back to cache
    memoSet(cacheKey, updated, ACTIVITY_TTL);

    return addRateLimitHeaders(NextResponse.json({ ok: true }), burst);
  } catch (e: unknown) {
    console.error('Failed to log activity:', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

