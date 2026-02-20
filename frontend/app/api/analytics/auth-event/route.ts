import { NextRequest, NextResponse } from 'next/server';
import { captureServer } from '@/lib/server/analytics';
import { createClient } from '@/lib/supabase/server';
import { ensureDistinctId, FALLBACK_ID_COOKIE, FALLBACK_ID_MAX_AGE } from '@/lib/analytics/fallback-id';

export const runtime = 'nodejs';

/**
 * Auth funnel events (signup_completed, login_completed) ONLY.
 * Server-side; no consent required.
 * Uses user_id as distinctId when authenticated, else visitor_id (or fallback id).
 *
 * NAMING: signup_completed / login_completed always via this auth-event endpoint.
 * All other events use /api/analytics/track-event. Do not send auth funnel events to track-event.
 *
 * POST /api/analytics/auth-event
 * Body: { type: 'signup_completed' | 'login_completed', method, provider?, source_path?, visitor_id? }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const {
      type,
      method = 'email',
      provider = null,
      source_path,
      visitor_id: bodyVisitorId,
    } = body;

    if (type !== 'signup_completed' && type !== 'login_completed') {
      return NextResponse.json({ ok: false, error: 'Invalid type' }, { status: 400 });
    }

    const visitorId = (bodyVisitorId as string) ?? req.cookies.get('visitor_id')?.value ?? null;
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    } catch {}

    const cookies = { get: (n: string) => req.cookies.get(n) };
    const { distinctId, isFallback, isNew } = ensureDistinctId(userId, visitorId, cookies);
    const props: Record<string, unknown> = {
      method: method === 'oauth' ? 'oauth' : 'email',
      provider: provider ?? null,
      source_path: source_path ?? null,
      visitor_id: visitorId,
      user_id: userId,
      timestamp: new Date().toISOString(),
      source: 'auth_event_api',
    };
    if (isFallback) (props as Record<string, unknown>).anonymous_fallback_id = distinctId;

    await captureServer(type, props, distinctId);
    // Also send auth_login_success for login_completed (dashboard backward compatibility - client-side can be lost on reload)
    if (type === 'login_completed') {
      await captureServer('auth_login_success', { ...props, method: props.method === 'oauth' ? 'oauth' : 'email_password' }, distinctId);
    }
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
  } catch (e: unknown) {
    console.error('auth-event error:', e);
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
