// app/api/rate-limit/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRateLimitStatus } from '@/lib/api/rate-limit';
import { withMetrics } from '@/lib/observability/withMetrics';

async function getHandler(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is Pro - use standardized check
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);
    const status = getRateLimitStatus(req, user.id, isPro);

    return NextResponse.json({
      ok: true,
      status,
      tier: isPro ? 'pro' : 'free',
    });
  } catch (error: any) {
    console.error('Rate limit status error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to get rate limit status' },
      { status: 500 }
    );
  }
}

export const GET = withMetrics(getHandler);

// Enable edge runtime for better performance
export const runtime = 'edge';
export const dynamic = 'force-dynamic';


































































