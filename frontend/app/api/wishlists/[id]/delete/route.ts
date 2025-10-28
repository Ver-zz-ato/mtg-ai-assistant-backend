import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user;
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    // Check ownership
    const { data: wishlist } = await (supabase as any)
      .from('wishlists')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    
    if (!wishlist || wishlist.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // Check if it's the only wishlist
    const { data: allWishlists } = await (supabase as any)
      .from('wishlists')
      .select('id')
      .eq('user_id', user.id);
    
    if (allWishlists && allWishlists.length <= 1) {
      return NextResponse.json({ ok: false, error: 'cannot delete your only wishlist' }, { status: 400 });
    }

    // Delete wishlist (cascade deletes items)
    const { error } = await (supabase as any)
      .from('wishlists')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

