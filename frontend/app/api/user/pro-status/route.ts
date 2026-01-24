import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic'; // Disable caching

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, isPro: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check Pro status from profile table (authoritative source)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', user.id)
      .single();
    
    // Check multiple sources for Pro status (same logic as SupportForm and useProStatus)
    const isProFromProfile = profile?.is_pro === true;
    const isProFromMetadata = user?.user_metadata?.is_pro === true || user?.user_metadata?.pro === true;
    const isPro = isProFromProfile || isProFromMetadata;
    
    return NextResponse.json({ 
      ok: true, 
      isPro,
      fromProfile: isProFromProfile,
      fromMetadata: isProFromMetadata,
      profileError: profileError ? profileError.message : null
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: any) {
    console.error('Pro status API error:', error);
    return NextResponse.json(
      { ok: false, isPro: false, error: error?.message || 'Failed to get Pro status' },
      { 
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
