import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // Fetch changelog from database (public endpoint, no auth required)
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'changelog')
      .maybeSingle();

    if (error) {
      console.error('Error fetching changelog:', error);
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 });
    }

    const changelogData = data?.value || { 
      entries: [], 
      last_updated: new Date().toISOString() 
    };

    return NextResponse.json({ 
      ok: true, 
      changelog: changelogData
    });

  } catch (error) {
    console.error('Changelog GET error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}