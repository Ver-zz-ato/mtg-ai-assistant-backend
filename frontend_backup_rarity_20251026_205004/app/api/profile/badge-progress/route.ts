import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateBadgeProgress, getClosestBadges } from '@/lib/badge-calculator';

export const runtime = 'nodejs';

/**
 * Get badge progress for current user
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const allBadges = await calculateBadgeProgress(user.id);
    const closestBadges = getClosestBadges(allBadges);

    return NextResponse.json({
      ok: true,
      badges: closestBadges,
      allBadges,
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


