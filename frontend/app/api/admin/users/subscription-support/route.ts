import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';
import { getSubscriptionSupportForAdmin } from '@/lib/admin/subscription-support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Admin: subscription / entitlement support bundle for one user.
 * GET /api/admin/users/subscription-support?userId=<uuid>
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    if (!userId || !UUID_RE.test(userId)) {
      return NextResponse.json({ ok: false, error: 'Valid userId required' }, { status: 400 });
    }

    const support = await getSubscriptionSupportForAdmin(userId);
    return NextResponse.json({ ok: true, support });
  } catch (error: unknown) {
    console.error('[admin/users/subscription-support]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
