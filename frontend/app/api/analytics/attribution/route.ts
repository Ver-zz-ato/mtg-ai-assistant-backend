import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSupabase } from '@/lib/server-supabase';
import { hashGuestToken, hashString } from '@/lib/guest-tracking';

export const runtime = 'nodejs';

function safeStr(v: unknown, maxLen = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s.slice(0, maxLen) : null;
}

export async function POST(req: NextRequest) {
  try {
    // Guard Supabase client creation
    let supabase: Awaited<ReturnType<typeof getServerSupabase>>;
    try {
      supabase = await getServerSupabase();
    } catch (e) {
      console.error('[Attribution] Failed to create Supabase client:', e);
      return NextResponse.json({ ok: false, error: 'service_unavailable' }, { status: 503 });
    }

    // Guard auth check - don't fail if auth check fails
    let user: { id: string } | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user ?? null;
    } catch (e) {
      console.error('[Attribution] Auth check failed:', e);
    }

    let anonId: string | null = null;

    if (user?.id) {
      try {
        anonId = await hashString(user.id);
      } catch (e) {
        console.error('[Attribution] Failed to hash user ID:', e);
      }
    }
    
    if (!anonId) {
      try {
        const cookieStore = await cookies();
        const guestToken = cookieStore.get('guest_session_token')?.value || null;
        if (guestToken) {
          anonId = await hashGuestToken(guestToken);
        }
      } catch (e) {
        console.error('[Attribution] Failed to get guest token:', e);
      }
    }

    const body = await req.json().catch(() => ({}));
    if (!anonId && body?.anon_id_fallback && typeof body.anon_id_fallback === 'string') {
      const fallback = body.anon_id_fallback.trim();
      if (fallback.length > 0 && fallback.length <= 200) {
        anonId = fallback;
      }
    }

    if (!anonId) {
      return NextResponse.json({ ok: false, error: 'cannot_identify_user' }, { status: 400 });
    }

    const initialPathname = safeStr(body?.initial_pathname, 500);
    if (!initialPathname) {
      return NextResponse.json({ ok: false, error: 'initial_pathname_required' }, { status: 400 });
    }

    const referrerDomain = safeStr(body?.referrer_domain, 255);
    const utmSource = safeStr(body?.utm_source, 255);
    const utmMedium = safeStr(body?.utm_medium, 255);
    const utmCampaign = safeStr(body?.utm_campaign, 255);
    const utmContent = safeStr(body?.utm_content, 255);
    const utmTerm = safeStr(body?.utm_term, 255);

    // Check for existing attribution record with error handling
    let existing: { id: string; user_id: string | null } | null = null;
    try {
      const { data, error } = await supabase
        .from('user_attribution')
        .select('id, user_id')
        .eq('anon_id', anonId)
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('[Attribution] Failed to check existing record:', error.message);
        // Continue anyway - we'll try to insert and let unique constraint handle duplicates
      } else {
        existing = data;
      }
    } catch (e) {
      console.error('[Attribution] Exception checking existing record:', e);
    }

    if (existing) {
      // Update user_id if we now have an authenticated user
      if (user?.id && !existing.user_id) {
        try {
          await supabase
            .from('user_attribution')
            .update({ user_id: user.id })
            .eq('anon_id', anonId)
            .is('user_id', null);
        } catch (e) {
          console.error('[Attribution] Failed to update user_id:', e);
        }
      }
      return NextResponse.json({ ok: true, recorded: false });
    }

    // Insert new attribution record
    try {
      const { error } = await supabase.from('user_attribution').insert({
        anon_id: anonId,
        user_id: user?.id ?? null,
        initial_pathname: initialPathname,
        initial_referrer_domain: referrerDomain,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        utm_term: utmTerm,
      });

      if (error) {
        // Duplicate key is actually fine - race condition handled
        if (error.code === '23505') {
          return NextResponse.json({ ok: true, recorded: false });
        }
        // Table doesn't exist or permission denied - log but don't fail hard
        if (error.code === '42P01' || error.code === '42501') {
          console.error('[Attribution] Table or permission issue:', error.message);
          return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 200 });
        }
        // Non-critical feature - log but return 200 to avoid blocking user experience
        console.error('[Attribution] Insert error:', error.code, error.message);
        return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 200 });
      }

      return NextResponse.json({ ok: true, recorded: true });
    } catch (e) {
      console.error('[Attribution] Insert exception:', e);
      // Non-critical feature - return success to avoid blocking user experience
      return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 200 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'server_error';
    console.error('[Attribution] Unhandled error:', msg);
    // Attribution is non-critical - return 200 to avoid breaking client experience
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
