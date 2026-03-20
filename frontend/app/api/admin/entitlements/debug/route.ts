import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';
import { getEntitlementDebugForAdmin } from '@/lib/server-pro-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only: inspect entitlement resolution for a given user.
 * GET /api/admin/entitlements/debug?userId=<uuid>
 * Returns profile fields, metadata, sources, final Pro status, mismatch flags.
 * Does not expose secrets or full billing tokens.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const userId = req.nextUrl.searchParams.get('userId')?.trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 });
    }

    const debug = await getEntitlementDebugForAdmin(userId);
    return NextResponse.json({ ok: true, debug });
  } catch (error: unknown) {
    console.error('[admin/entitlements/debug]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
