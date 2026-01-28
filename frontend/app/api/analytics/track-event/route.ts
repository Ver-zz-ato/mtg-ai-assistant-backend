import { NextRequest, NextResponse } from 'next/server';
import { captureServer } from '@/lib/server/analytics';
import { createClient } from '@/lib/supabase/server';
import { ensureDistinctId, FALLBACK_ID_COOKIE, FALLBACK_ID_MAX_AGE } from '@/lib/analytics/fallback-id';

export const runtime = 'nodejs';

/**
 * Generic server-side event tracking endpoint.
 * Bypasses cookie consent. Uses visitor_id (cookie) as distinctId when anonymous,
 * user_id when authenticated; adds visitor_id to properties for joining.
 *
 * NAMING: signup_completed / login_completed MUST use /api/analytics/auth-event only.
 * Everything else uses this track-event endpoint. Keeps auth funnel props consistent.
 *
 * POST /api/analytics/track-event
 * Body: { event, properties?, userId?, visitor_id? }
 */
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
    const { event, properties = {}, userId: providedUserId, visitor_id: bodyVisitorId } = body;

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ ok: false, error: 'Event name required' }, { status: 400 });
    }

    const visitorId = (bodyVisitorId ?? req.cookies.get('visitor_id')?.value ?? null) as string | null;

    let finalUserId = (providedUserId ?? (properties as Record<string, unknown>)?.user_id ?? null) as string | null;
    if (!finalUserId) {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          finalUserId = user.id;
          (properties as Record<string, unknown>).user_email = user.email;
        }
      } catch {}
    }

    const cookies = { get: (n: string) => req.cookies.get(n) };
    const { distinctId, isFallback, isNew } = ensureDistinctId(finalUserId, visitorId, cookies);
    const payload: Record<string, unknown> = {
      ...properties,
      user_id: finalUserId ?? null,
      visitor_id: visitorId ?? null,
      timestamp: new Date().toISOString(),
      source: 'server_side_tracking',
    };
    if (isFallback) payload.anonymous_fallback_id = distinctId;

    await captureServer(event, payload, distinctId);
    const res = NextResponse.json({ ok: true });
    if (isNew) {
      res.cookies.set(FALLBACK_ID_COOKIE, distinctId, {
        path: '/',
        maxAge: FALLBACK_ID_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return res;
  } catch (error: any) {
    console.error(`Failed to track event ${body?.event} server-side:`, error);
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}

