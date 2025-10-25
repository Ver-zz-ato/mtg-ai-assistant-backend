import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCardDataForProfileTrends } from '@/lib/server/scryfallCache';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const testCardNames = body.cardNames || ['Sol Ring', 'Lightning Bolt', 'Counterspell', 'Llanowar Elves', 'Wrath of God'];

    // Test the same flow as profile trends
    console.log('=== PROFILE TRENDS DEBUG ===');
    
    // 1. Get user's decks (same as profile)
    const { data: decks } = await supabase
      .from('decks')
      .select('id, commander, title')
      .eq('user_id', user.id)
      .limit(10);
      
    const deckList = Array.isArray(decks) ? decks : [];
    const namePool = deckList.flatMap((x: any) => [String(x.commander || ''), String(x.title || '')]).filter(Boolean);
    
    console.log(`Found ${deckList.length} decks for user`);
    console.log(`Name pool from commanders/titles:`, namePool.slice(0, 5));
    
    // 2. Test cached card data lookup
    const testNames = namePool.length > 0 ? namePool.slice(0, 10) : testCardNames;
    console.log(`Testing with names:`, testNames);
    
    const cardData = await getCardDataForProfileTrends(testNames);
    console.log(`Cache returned ${cardData.size} results`);
    
    // 3. Convert to result format
    const result: Record<string, any> = {};
    const norm = (name: string) => String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    
    for (const original of testNames) {
      const normalized = norm(original);
      const cachedData = cardData.get(normalized);
      
      result[original] = cachedData || null;
      result[normalized] = cachedData || null; // Also store by normalized key
    }
    
    // 4. Test color counting (same logic as profile)
    const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    let foundData = 0;
    
    for (const [name, data] of Object.entries(result)) {
      if (!data) continue;
      foundData++;
      const ci: string[] = Array.isArray(data.color_identity) ? data.color_identity : [];
      for (const c of ci) {
        if (colorCounts[c] !== undefined) {
          colorCounts[c] = (colorCounts[c] || 0) + 1;
        }
      }
    }
    
    console.log(`Found data for ${foundData} cards`);
    console.log(`Color counts:`, colorCounts);
    console.log('=== END DEBUG ===');
    
    return NextResponse.json({
      ok: true,
      debug: {
        userDecks: deckList.length,
        namePool: namePool.slice(0, 10),
        testNames,
        cacheHits: cardData.size,
        foundData,
        colorCounts,
        sampleData: Array.from(cardData.entries()).slice(0, 3),
        resultKeys: Object.keys(result).slice(0, 10)
      },
      cardData: result
    });
  } catch (error: any) {
    console.error('Profile trends debug error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'debug_failed'
    }, { status: 500 });
  }
}