import { NextRequest, NextResponse } from 'next/server';
import { captureServer } from '@/lib/server/analytics';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Server-side signup tracking endpoint
 * This bypasses cookie consent requirements since it runs on the server
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { method = 'email', userId, userEmail } = body;

    // Get the user if we have a session but no userId provided
    let finalUserId = userId;
    if (!finalUserId) {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          finalUserId = user.id;
        }
      } catch {}
    }

    // Track signup server-side (no cookie consent needed)
    await captureServer('signup_completed', {
      method,
      user_id: finalUserId || null,
      user_email: userEmail || null,
      timestamp: new Date().toISOString(),
      source: 'server_side_tracking'
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Failed to track signup server-side:', error);
    // Don't fail the request if tracking fails
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}

