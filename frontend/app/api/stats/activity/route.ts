// app/api/stats/activity/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { memoGet, memoSet } from "@/lib/utils/memoCache";

const MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * MINUTE;
const CACHE_TTL = 60 * 1000; // 1 minute cache

export const dynamic = 'force-dynamic';

interface ActivityItem {
  type: string;
  message: string;
  timestamp: string;
}

function generatePlaceholderActivities(count: number, recentTimestamp: boolean = true): ActivityItem[] {
  const activities: ActivityItem[] = [];
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  const deckNames = [
    'Atraxa Reanimator', 'Yuriko Ninjas', 'Krenko Mob Boss', 'Meren of Clan Nel Toth',
    'Chulane Landfall', 'Korvold Treasure', 'Jodah Archmage', 'Prosper Exile'
  ];
  
  const cardNames = ['Sol Ring', 'Mana Crypt', 'Force of Will', 'Cyclonic Rift', 'Rhystic Study'];
  
  const signupMessages = [
    'New planeswalker joined!',
    'Someone just signed up!',
    'New member joined the community',
    'Welcome, new brewer!',
    'Another planeswalker arrived!'
  ];
  
  const activityTypes = [
    { type: 'deck_uploaded', gen: () => ({ message: `New deck uploaded: ${deckNames[Math.floor(Math.random() * deckNames.length)]}`, timestamp: new Date(now - Math.random() * 60 * MINUTE).toISOString() }) },
    { type: 'user_joined', gen: () => ({ message: signupMessages[Math.floor(Math.random() * signupMessages.length)], timestamp: new Date(now - Math.random() * 2 * 60 * MINUTE).toISOString() }) },
    { type: 'price_change', gen: () => {
      const card = cardNames[Math.floor(Math.random() * cardNames.length)];
      const change = (Math.random() * 8 + 1).toFixed(1);
      const direction = Math.random() > 0.5 ? 'down' : 'up';
      return { message: `${card} price ${direction} ${change}% this week`, timestamp: new Date(now - Math.random() * 4 * 60 * MINUTE).toISOString() };
    }},
    { type: 'mulligan_ran', gen: () => ({ message: 'Mulligan simulation run', timestamp: new Date(now - Math.random() * 10 * MINUTE).toISOString() }) },
    { type: 'probability_ran', gen: () => ({ message: 'Probability calculator used', timestamp: new Date(now - Math.random() * 15 * MINUTE).toISOString() }) },
    { type: 'budget_saved', gen: () => {
      const amount = (Math.random() * 500 + 50).toFixed(0);
      return { message: `Budget swaps saved $${amount}`, timestamp: new Date(now - Math.random() * 20 * MINUTE).toISOString() };
    }},
    { type: 'cost_computed', gen: () => ({ message: 'Cost to finish computed', timestamp: new Date(now - Math.random() * 30 * MINUTE).toISOString() }) },
    { type: 'custom_card', gen: () => ({ message: 'Custom card created', timestamp: new Date(now - Math.random() * 45 * MINUTE).toISOString() }) },
  ];
  
  for (let i = 0; i < count; i++) {
    const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
    const { message, timestamp } = activityType.gen();
    activities.push({ type: activityType.type, message, timestamp });
  }
  
  // Sort by timestamp (most recent first)
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return activities;
}

export async function GET() {
  try {
    // Check cache first
    const cacheKey = 'activity_stats';
    const cached = memoGet<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { status: 200 });
    }

    const supabase = await createClient();

    // Get active users (users with deck activity in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - FIVE_MINUTES).toISOString();
    
    // Count distinct users who created or updated decks in last 5 minutes
    const { data: recentDeckActivity, error: deckError } = await supabase
      .from('decks')
      .select('user_id')
      .gte('updated_at', fiveMinutesAgo);
    
    let activeUsers = 0;
    if (!deckError && recentDeckActivity) {
      activeUsers = new Set(recentDeckActivity.map((d: any) => d.user_id)).size;
    }
    
    // If active users count is low, add some placeholder
    if (activeUsers < 3) {
      activeUsers = Math.floor(Math.random() * 12) + 5; // 5-16 active users
    }

    // Get recent activities from cache (logged via /api/stats/activity/log)
    const cacheKeyLog = 'activity_log';
    const cachedActivities: ActivityItem[] = memoGet<ActivityItem[]>(cacheKeyLog) || [];
    
    // Get recent activities from database
    const activities: ActivityItem[] = [...cachedActivities]; // Start with cached
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * MINUTE).toISOString();

    // Recent deck uploads
    try {
      const { data: recentDecks } = await supabase
        .from('decks')
        .select('title, created_at')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (recentDecks) {
        for (const deck of recentDecks) {
          activities.push({
            type: 'deck_uploaded',
            message: `New deck uploaded: ${deck.title || 'Untitled Deck'}`,
            timestamp: deck.created_at,
          });
        }
      }
    } catch {}

    // Recent signups
    try {
      const { data: recentSignups } = await supabase
        .from('profiles')
        .select('created_at')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (recentSignups) {
        for (const profile of recentSignups) {
          activities.push({
            type: 'user_joined',
            message: 'New planeswalker joined!',
            timestamp: profile.created_at,
          });
        }
      }
    } catch {}

    // If we have fewer than 5 real activities, add placeholders to reach at least 8-10 total
    const neededPlaceholders = Math.max(0, 8 - activities.length);
    if (neededPlaceholders > 0) {
      const placeholders = generatePlaceholderActivities(neededPlaceholders);
      activities.push(...placeholders);
    }

    // Sort all activities by timestamp (most recent first) and limit to 15
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const recentActivity = activities.slice(0, 15);

    const result = {
      ok: true,
      activeUsers,
      recentActivity,
      cachedAt: new Date().toISOString(),
    };

    // Cache for 1 minute
    memoSet(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    console.error('Failed to fetch activity stats:', e);
    
    // Return fallback data on error
    const fallbackActivities = generatePlaceholderActivities(10);
    return NextResponse.json({ 
      ok: false,
      error: e?.message || 'Failed to fetch activity',
      activeUsers: 7,
      recentActivity: fallbackActivities,
      cachedAt: new Date().toISOString(),
    }, { status: 200 }); // Return 200 with fallback data
  }
}

