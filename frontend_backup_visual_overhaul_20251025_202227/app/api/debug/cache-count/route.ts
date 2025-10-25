import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // Test with both regular supabase and admin client
    const supabase = await createClient();
    const admin = getAdmin();
    
    // Count with regular client (RLS applied) - use name instead of id since it's the primary key
    const { count: regularCount, error: regularError } = await supabase
      .from('scryfall_cache')
      .select('name', { count: 'exact', head: true });
      
    // Count with admin client (bypass RLS) - use name instead of id
    let adminCount = null;
    let adminError = null;
    if (admin) {
      const result = await admin
        .from('scryfall_cache')
        .select('name', { count: 'exact', head: true });
      adminCount = result.count;
      adminError = result.error;
    }
    
    // Get a sample of data
    const { data: sampleData, error: sampleError } = admin
      ? await admin.from('scryfall_cache').select('name, updated_at, color_identity, cmc, mana_cost').limit(10)
      : await supabase.from('scryfall_cache').select('name, updated_at, color_identity, cmc, mana_cost').limit(10);
      
    return NextResponse.json({
      ok: true,
      regularClient: {
        count: regularCount || 0,
        error: regularError?.message || null
      },
      adminClient: {
        count: adminCount || 0,
        error: adminError?.message || null
      },
      sample: sampleData || [],
      sampleError: sampleError?.message || null,
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || 'server_error' 
    }, { status: 500 });
  }
}