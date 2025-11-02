import { NextRequest, NextResponse } from 'next/server';
import { captureServer } from '@/lib/server/analytics';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Generic server-side event tracking endpoint
 * This bypasses cookie consent requirements since it runs on the server
 * 
 * Usage:
 * POST /api/analytics/track-event
 * Body: { event: 'event_name', properties: { ... }, userId?: 'optional' }
 */
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
    const { event, properties = {}, userId: providedUserId } = body;

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ ok: false, error: 'Event name required' }, { status: 400 });
    }

    // Get the user if we have a session but no userId provided
    let finalUserId = providedUserId;
    if (!finalUserId && properties?.user_id) {
      finalUserId = properties.user_id;
    }
    
    if (!finalUserId) {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          finalUserId = user.id;
          // Enrich properties with user data
          properties.user_email = user.email;
        }
      } catch {}
    }

    // Track server-side (no cookie consent needed)
    await captureServer(event, {
      ...properties,
      user_id: finalUserId || null,
      timestamp: new Date().toISOString(),
      source: 'server_side_tracking'
    }, finalUserId || undefined);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error(`Failed to track event ${body?.event} server-side:`, error);
    // Don't fail the request if tracking fails
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}

