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
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    let anonId: string | null = null;

    if (user?.id) {
      anonId = await hashString(user.id);
    } else {
      const cookieStore = await cookies();
      const guestToken = cookieStore.get('guest_session_token')?.value || null;
      if (guestToken) {
        anonId = await hashGuestToken(guestToken);
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

    const { data: existing } = await supabase
      .from('user_attribution')
      .select('id, user_id')
      .eq('anon_id', anonId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (user?.id && !existing.user_id) {
        await supabase
          .from('user_attribution')
          .update({ user_id: user.id })
          .eq('anon_id', anonId)
          .is('user_id', null);
      }
      return NextResponse.json({ ok: true, recorded: false });
    }

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
      if (error.code === '23505') {
        return NextResponse.json({ ok: true, recorded: false });
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('[attribution] insert error:', error.code, error.message);
      }
      return NextResponse.json({ ok: false, error: 'attribution_failed' }, { status: 200 });
    }

    return NextResponse.json({ ok: true, recorded: true });
  } catch (e: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[attribution] unexpected error:', e);
    }
    return NextResponse.json({ ok: false, error: 'attribution_failed' }, { status: 200 });
  }
}
