// app/api/stats/users/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";

const HOUR = 60 * 60 * 1000;

export async function GET() {
  try {
    // Check cache first
    const cacheKey = 'user_stats';
    const cached = memoGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const supabase = await createClient();

    // Get total user count
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    // Get recent activity (decks created in last hour)
    const oneHourAgo = new Date(Date.now() - HOUR).toISOString();
    const { count: recentDecks } = await supabase
      .from('decks')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneHourAgo);

    // Get recent signups (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * HOUR).toISOString();
    const { count: recentSignups } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo);

    const stats = {
      ok: true,
      totalUsers: totalUsers || 0,
      recentDecks: recentDecks || 0,
      recentSignups: recentSignups || 0,
      cachedAt: new Date().toISOString(),
    };

    // Cache for 1 hour
    memoSet(cacheKey, stats, HOUR);

    return NextResponse.json(stats, { status: 200 });
  } catch (e: any) {
    console.error('Failed to fetch user stats:', e);
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || 'Failed to fetch stats',
      // Return fallback values
      totalUsers: 1000, // Fallback
      recentDecks: 0,
      recentSignups: 0,
    }, { status: 200 }); // Return 200 with fallback data
  }
}

// Enable ISR caching
export const revalidate = 3600; // 1 hour




