import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withMetrics } from '@/lib/observability/withMetrics';

// Note: Removed edge runtime - Supabase client may not work properly on edge
export const revalidate = 0; // No cache - always fetch fresh data

async function getHandler(_req: NextRequest) {
  try {
    const supabase = await createClient();

    // Fetch changelog from database (public endpoint, no auth required)
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'changelog')
      .maybeSingle();

    if (error) {
      console.error('Error fetching changelog:', error);
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 });
    }

    const changelogData = data?.value || { 
      entries: [], 
      last_updated: new Date().toISOString() 
    };

    return NextResponse.json({ 
      ok: true, 
      changelog: changelogData
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('Changelog GET error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export const GET = withMetrics(getHandler);