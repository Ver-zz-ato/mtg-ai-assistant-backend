import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Admin client not available' }, { status: 500 });
    }

    // Check if user is admin
    const { data: { user } } = await admin.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const { action } = await req.json().catch(() => ({ action: 'count' }));

    if (action === 'clear') {
      // Clear all cache entries
      const { error } = await admin.from('scryfall_cache').delete().neq('name', '');
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: 'cleared', message: 'Cache cleared successfully' });
    }
    
    if (action === 'test_insert') {
      // Test inserting a simple row
      const testRow = {
        name: 'lightning bolt',
        small: 'https://test.com/small.jpg',
        normal: 'https://test.com/normal.jpg', 
        art_crop: 'https://test.com/art.jpg',
        type_line: 'Instant',
        oracle_text: 'Lightning Bolt deals 3 damage to any target.',
        color_identity: ['R'],
        mana_cost: '{R}',
        cmc: 1,
        updated_at: new Date().toISOString()
      };
      
      const { error, data } = await admin
        .from('scryfall_cache')
        .upsert([testRow], { onConflict: 'name' })
        .select();
        
      if (error) {
        return NextResponse.json({ 
          ok: false, 
          error: error.message,
          details: error 
        }, { status: 500 });
      }
      
      // Verify it was inserted
      const { data: verifyData, error: verifyError } = await admin
        .from('scryfall_cache')
        .select('*')
        .eq('name', 'lightning bolt')
        .maybeSingle();
        
      return NextResponse.json({ 
        ok: true, 
        action: 'test_insert',
        inserted: data,
        verified: verifyData,
        verifyError: verifyError?.message || null
      });
    }
    
    // Default: count entries
    const { count, error } = await admin
      .from('scryfall_cache')
      .select('name', { count: 'exact', head: true });
      
    const { data: sampleData } = await admin
      .from('scryfall_cache') 
      .select('name, updated_at, cmc, mana_cost')
      .limit(5);
      
    return NextResponse.json({
      ok: true,
      action: 'count',
      count: count || 0,
      sample: sampleData || [],
      error: error?.message || null
    });

  } catch (e: any) {
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || 'server_error' 
    }, { status: 500 });
  }
}