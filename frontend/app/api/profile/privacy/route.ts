import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { capture } from '@/lib/ph';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Get current privacy setting from user metadata
    const dataShareEnabled = user.user_metadata?.data_share_enabled ?? true; // Default ON for new users
    
    return NextResponse.json({ 
      ok: true, 
      data_share_enabled: dataShareEnabled 
    });

  } catch (error) {
    console.error('Privacy GET error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // CSRF protection: Validate Origin header
    const req = request as any as import('next/server').NextRequest;
    const { validateOrigin } = await import('@/lib/api/csrf');
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid origin. This request must come from the same site.' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { data_share_enabled } = body;
    
    if (typeof data_share_enabled !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'Invalid data_share_enabled value' }, { status: 400 });
    }

    // Update user metadata with privacy preference
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        data_share_enabled
      }
    });

    if (updateError) {
      throw updateError;
    }

    // Track the toggle event
    try {
      capture('privacy_data_share_toggled', { 
        value: data_share_enabled,
        user_id: user.id 
      });
    } catch (captureError) {
      console.warn('Failed to capture privacy toggle event:', captureError);
    }

    return NextResponse.json({ 
      ok: true, 
      data_share_enabled 
    });

  } catch (error) {
    console.error('Privacy POST error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}