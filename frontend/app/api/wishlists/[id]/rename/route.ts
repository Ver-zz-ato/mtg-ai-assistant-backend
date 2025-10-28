import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user;
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    
    if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
    if (name.length > 100) return NextResponse.json({ ok: false, error: 'name too long (max 100 chars)' }, { status: 400 });

    // Check ownership
    const { data: wishlist } = await (supabase as any)
      .from('wishlists')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    
    if (!wishlist || wishlist.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // Update name
    const { error } = await (supabase as any)
      .from('wishlists')
      .update({ name })
      .eq('id', id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

