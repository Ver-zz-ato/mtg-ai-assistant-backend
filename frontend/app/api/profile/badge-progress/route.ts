import { NextResponse } from 'next/server';
import { createClient, createClientWithBearerToken } from '@/lib/server-supabase';
import { getClosestLockedBadges, syncUserBadgeState } from '@/lib/badges/canonical';

export const runtime = 'nodejs';

/**
 * Get badge progress for current user
 */
export async function GET(req: Request) {
  try {
    let supabase = await createClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        supabase = createClientWithBearerToken(bearerToken);
        ({
          data: { user },
        } = await supabase.auth.getUser());
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const synced = await syncUserBadgeState(user.id);
    const closestBadges = getClosestLockedBadges(synced.progress);

    return NextResponse.json({
      ok: true,
      badges: closestBadges,
      allBadges: synced.progress,
      earnedBadges: synced.progress.filter((badge) => badge.unlocked),
      summary: {
        earnedCount: synced.progress.filter((badge) => badge.unlocked).length,
        totalCount: synced.progress.length,
      },
    }, {
      headers: {
        'Cache-Control': 'private, max-age=300', // 5 minutes cache per user
      }
    });

  } catch (error: any) {
    console.error('Error getting badge progress:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get badge progress' },
      { status: 500 }
    );
  }
}


