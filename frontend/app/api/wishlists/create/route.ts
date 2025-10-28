import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user;
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    
    if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
    if (name.length > 100) return NextResponse.json({ ok: false, error: 'name too long (max 100 chars)' }, { status: 400 });

    // Check for duplicate name
    const { data: existing } = await (supabase as any)
      .from('wishlists')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', name)
      .maybeSingle();
    
    if (existing?.id) return NextResponse.json({ ok: false, error: 'wishlist name already exists' }, { status: 400 });

    // Create wishlist
    const { data: wishlist, error } = await (supabase as any)
      .from('wishlists')
      .insert({
        user_id: user.id,
        name,
        is_public: false,
      })
      .select('id, name, is_public')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, wishlist });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

