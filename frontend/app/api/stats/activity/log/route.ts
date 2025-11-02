// app/api/stats/activity/log/route.ts
import { NextRequest, NextResponse } from "next/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";

const MAX_ACTIVITIES = 50;
const ACTIVITY_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ActivityItem {
  type: string;
  message: string;
  timestamp: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { type, message, metadata } = body;

    if (!type || !message) {
      return NextResponse.json({ ok: false, error: 'type and message required' }, { status: 400 });
    }

    // Get existing activities from cache
    const cacheKey = 'activity_log';
    const existing: ActivityItem[] = memoGet<ActivityItem[]>(cacheKey) || [];

    // Create new activity
    const newActivity: ActivityItem = {
      type,
      message: String(message).slice(0, 200), // Limit message length
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

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Failed to log activity:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

