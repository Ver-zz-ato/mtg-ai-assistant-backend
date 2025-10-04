// app/debug/profile-data/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProfileDataDebugPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  // Check profiles_public data
  const { data: profilePublic } = await supabase
    .from('profiles_public')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  // Check user's decks
  const { data: allDecks } = await supabase
    .from('decks')
    .select('id, title, commander, is_public, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const publicDecks = allDecks?.filter(d => d.is_public) || [];

  // Check deck_cards for first public deck
  let firstPublicDeckCards = null;
  if (publicDecks.length > 0) {
    const { data: cards } = await supabase
      .from('deck_cards')
      .select('name, qty')
      .eq('deck_id', publicDecks[0].id)
      .limit(10);
    firstPublicDeckCards = cards;
  }

  // Check if there are any deck_cards at all for this user
  let totalDeckCards = 0;
  if (allDecks && allDecks.length > 0) {
    const deckIds = allDecks.map(d => d.id);
    const { count } = await supabase
      .from('deck_cards')
      .select('id', { count: 'exact', head: true })
      .in('deck_id', deckIds);
    totalDeckCards = count || 0;
  }

  // Scryfall cache test - check common cards plus cards from user's actual decks
  let scryfallTest = null;
  try {
    // First, let's see what's actually in the cache (raw inspection)
    const { data: rawCacheData } = await supabase
      .from('scryfall_cache')
      .select('name, type_line, color_identity, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);
    
    const rawCache = Array.isArray(rawCacheData) ? rawCacheData : [];
    
    // Use actually cached cards instead of hardcoded test cards
    const actualCachedNames = rawCache.slice(0, 5).map(row => row.name);
    const userCardNames = firstPublicDeckCards ? 
      firstPublicDeckCards.slice(0, 3).map((card: any) => card.name) : [];
    // Mix of actual cached cards + user deck cards for better testing
    const allTestNames = [...actualCachedNames, ...userCardNames].filter((name, index, arr) => arr.indexOf(name) === index);
    
    // Normalization function (should match the one in scryfallCache.ts)
    const norm = (name: string) => String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedTestNames = allTestNames.map(norm);
    
    console.log('DEBUG: Querying cache with names:', normalizedTestNames);
    const { data: cacheData, error: cacheError } = await supabase
      .from('scryfall_cache')
      .select('name, type_line, color_identity, mana_cost, updated_at')
      .in('name', normalizedTestNames)
      .limit(15);
    
    console.log('DEBUG: Cache query result:', { cacheData, cacheError, count: cacheData?.length });
    
    const cached = Array.isArray(cacheData) ? cacheData : [];
    const hasRecentData = cached.some(row => {
      const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
      const daysSinceUpdate = updatedAt ? (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24) : 999;
      return daysSinceUpdate < 7; // Consider data fresh if less than 7 days old
    });
    
    // Also check general cache health
    const { count: totalCacheCount } = await supabase
      .from('scryfall_cache')
      .select('id', { count: 'exact', head: true });
    
    const { data: recentCacheData } = await supabase
      .from('scryfall_cache')
      .select('updated_at')
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);
    
    const hasRecentCache = recentCacheData && recentCacheData.length > 0;
    
    scryfallTest = {
      success: cached.length > 0 && hasRecentData,
      cardCount: cached.length,
      totalCacheCount: totalCacheCount || 0,
      hasRecentActivity: hasRecentCache,
      error: cached.length === 0 ? 'No cached card data found for test cards - cache may be empty or prewarm job not running' : 
             !hasRecentData ? 'Cached data is stale (>7 days old) - prewarm job may have stopped' : null,
      cacheDetails: cached.map(row => ({
        name: row.name,
        hasTypeInfo: !!row.type_line,
        hasColorInfo: Array.isArray(row.color_identity) && row.color_identity.length > 0,
        hasManaInfo: !!row.mana_cost,
        lastUpdated: row.updated_at
      })).sort((a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime()),
      debugInfo: {
        testNamesOriginal: allTestNames,
        testNamesNormalized: normalizedTestNames,
        rawCacheCount: rawCache.length,
        rawCacheSample: rawCache.slice(0, 5).map(r => ({ name: r.name, updated: r.updated_at })),
        queryError: cacheError?.message || null,
        queryResults: cached.length,
        actualCachedNames: cached.map(r => r.name)
      }
    };
  } catch (error: any) {
    scryfallTest = {
      success: false,
      cardCount: 0,
      totalCacheCount: 0,
      hasRecentActivity: false,
      error: error?.message || 'Cache query failed'
    };
  }
  
  // Check scheduled job last run times
  let jobStatus = null;
  try {
    const { data: jobConfig } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['job:last:prewarm_scryfall', 'job:last:price_snapshot', 'job:last:price_snapshot_build', 'job:last:bulk_scryfall'])
      .limit(15);
    
    const jobs = Array.isArray(jobConfig) ? jobConfig : [];
    const prewarmJob = jobs.find(j => j.key === 'job:last:prewarm_scryfall');
    const priceJob = jobs.find(j => j.key === 'job:last:price_snapshot' || j.key === 'job:last:price_snapshot_build');
    const bulkJob = jobs.find(j => j.key === 'job:last:bulk_scryfall');
    
    jobStatus = {
      prewarmLastRun: prewarmJob?.value ? new Date(prewarmJob.value) : null,
      priceLastRun: priceJob?.value ? new Date(priceJob.value) : null,
      bulkLastRun: bulkJob?.value ? new Date(bulkJob.value) : null
    };
  } catch {
    jobStatus = { error: 'Could not fetch job status' };
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Profile Data Debug</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-semibold mb-3">User Info</h2>
          <div className="space-y-2 text-sm">
            <div><strong>User ID:</strong> {user.id}</div>
            <div><strong>Email:</strong> {user.email}</div>
            <div><strong>Username:</strong> {(user.user_metadata as any)?.username || 'Not set'}</div>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Public Profile</h2>
          <div className="space-y-2 text-sm">
            {profilePublic ? (
              <>
                <div><strong>Public:</strong> {profilePublic.is_public ? 'Yes' : 'No'}</div>
                <div><strong>Username:</strong> {profilePublic.username || 'Not set'}</div>
                <div><strong>Colors:</strong> {Array.isArray(profilePublic.colors) ? profilePublic.colors.join(', ') : 'None'}</div>
                <div><strong>Fav Commander:</strong> {profilePublic.favorite_commander || 'Not set'}</div>
                <div><strong>Signature Deck:</strong> {profilePublic.signature_deck_id || 'Not set'}</div>
                <div><strong>Pinned Decks:</strong> {Array.isArray(profilePublic.pinned_deck_ids) ? profilePublic.pinned_deck_ids.length : 0}</div>
              </>
            ) : (
              <div className="text-amber-500">No public profile found</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Decks Overview</h2>
          <div className="space-y-2 text-sm">
            <div><strong>Total Decks:</strong> {allDecks?.length || 0}</div>
            <div><strong>Public Decks:</strong> {publicDecks.length}</div>
            <div><strong>Total Deck Cards:</strong> {totalDeckCards}</div>
            <div><strong>Public Deck Titles:</strong></div>
            <ul className="ml-4 list-disc">
              {publicDecks.slice(0, 5).map(deck => (
                <li key={deck.id} className="truncate">
                  {deck.title || 'Untitled'} 
                  {deck.commander && <span className="text-neutral-400"> ({deck.commander})</span>}
                </li>
              ))}
              {publicDecks.length > 5 && <li className="text-neutral-400">...and {publicDecks.length - 5} more</li>}
            </ul>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-semibold mb-3">First Public Deck Cards</h2>
          <div className="space-y-2 text-sm">
            {firstPublicDeckCards ? (
              <>
                <div><strong>Cards Found:</strong> {firstPublicDeckCards.length}</div>
                <div><strong>Sample Cards:</strong></div>
                <ul className="ml-4 list-disc">
                  {firstPublicDeckCards.slice(0, 5).map((card: any, i: number) => (
                    <li key={i}>{card.qty}x {card.name}</li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="text-amber-500">
                {publicDecks.length === 0 ? 'No public decks to check' : 'No cards found for first public deck'}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 p-4 md:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Scryfall Cache Test</h2>
            <div className="flex gap-2">
              <form action="/api/cron/prewarm-scryfall" method="POST" className="inline">
                <button 
                  type="submit"
                  className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                >
                  Quick Refresh
                </button>
              </form>
              <form action="/api/cron/bulk-scryfall" method="POST" className="inline">
                <button 
                  type="submit"
                  className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded transition-colors"
                  title="Import all ~30,000 cards (may take 2-5 minutes)"
                >
                  Bulk Import All Cards
                </button>
              </form>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div><strong>Cache Status:</strong> 
              <span className={scryfallTest?.success ? 'text-green-500' : 'text-red-500'}>
                {scryfallTest?.success ? ' Working' : ' Issues detected'}
              </span>
            </div>
            <div><strong>Test Cards Found:</strong> {scryfallTest?.cardCount || 0}</div>
            <div><strong>Total Cache Entries:</strong> {scryfallTest?.totalCacheCount || 0}</div>
            <div><strong>Recent Cache Activity:</strong> 
              <span className={scryfallTest?.hasRecentActivity ? 'text-green-500' : 'text-amber-500'}>
                {scryfallTest?.hasRecentActivity ? ' Yes (within 7 days)' : ' No recent updates'}
              </span>
            </div>
            {scryfallTest?.error && (
              <div className="text-red-400"><strong>Issue:</strong> {scryfallTest.error}</div>
            )}
            {scryfallTest?.cacheDetails && scryfallTest.cacheDetails.length > 0 && (
              <div className="mt-2">
                <strong>Cache Details (sorted by most recent):</strong>
                <ul className="ml-4 list-disc text-xs mt-1 space-y-1">
                  {scryfallTest.cacheDetails.map((detail: any, i: number) => (
                    <li key={i}>
                      <span className="font-mono text-blue-400">{detail.name}</span> - 
                      Type: {detail.hasTypeInfo ? '✅' : '❌'}, 
                      Colors: {detail.hasColorInfo ? '✅' : '❌'}, 
                      Mana: {detail.hasManaInfo ? '✅' : '❌'}, 
                      Updated: {detail.lastUpdated ? new Date(detail.lastUpdated).toLocaleDateString() : 'Never'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scryfallTest?.debugInfo && (
              <details className="mt-3">
                <summary className="text-xs cursor-pointer hover:text-blue-400">🔍 Debug Info (click to expand)</summary>
                <div className="mt-2 text-xs bg-neutral-900 rounded p-2 space-y-1">
                  <div><strong>Test Names (Original):</strong> {JSON.stringify(scryfallTest.debugInfo.testNamesOriginal.slice(0, 3))}</div>
                  <div><strong>Test Names (Normalized):</strong> {JSON.stringify(scryfallTest.debugInfo.testNamesNormalized.slice(0, 3))}</div>
                  <div><strong>Raw Cache Entries:</strong> {scryfallTest.debugInfo.rawCacheCount}</div>
                  <div><strong>Query Results:</strong> {scryfallTest.debugInfo.queryResults} found</div>
                  {scryfallTest.debugInfo.queryError && (
                    <div><strong>Query Error:</strong> <span className="text-red-400">{scryfallTest.debugInfo.queryError}</span></div>
                  )}
                  <div><strong>Found Names:</strong> {JSON.stringify(scryfallTest.debugInfo.actualCachedNames)}</div>
                  <div><strong>Recent Cache Sample:</strong></div>
                  <ul className="ml-4 list-disc">
                    {scryfallTest.debugInfo.rawCacheSample.map((item: any, i: number) => (
                      <li key={i} className="font-mono">
                        {item.name} <span className="text-neutral-500">({item.updated ? new Date(item.updated).toLocaleDateString() : 'no date'})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </div>
        </section>
        
        <section className="rounded-xl border border-neutral-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Scheduled Jobs Status</h2>
          <div className="space-y-2 text-sm">
            {jobStatus?.error ? (
              <div className="text-red-400">⚠️ {jobStatus.error}</div>
            ) : (
              <>
                <div><strong>Prewarm Cache Job:</strong> 
                  {jobStatus?.prewarmLastRun ? (
                    <span className="text-green-500"> Last run {jobStatus.prewarmLastRun.toLocaleString()}</span>
                  ) : (
                    <span className="text-amber-500"> Never run or no data</span>
                  )}
                </div>
                <div><strong>Price Snapshot Job:</strong> 
                  {jobStatus?.priceLastRun ? (
                    <span className="text-green-500"> Last run {jobStatus.priceLastRun.toLocaleString()}</span>
                  ) : (
                    <span className="text-amber-500"> Never run or no data</span>
                  )}
                </div>
                <div><strong>Bulk Import Job:</strong> 
                  {jobStatus?.bulkLastRun ? (
                    <span className="text-green-500"> Last run {jobStatus.bulkLastRun.toLocaleString()}</span>
                  ) : (
                    <span className="text-amber-500"> Never run - click "Bulk Import All Cards" above</span>
                  )}
                </div>
                <div className="text-xs opacity-80 mt-2">
                  Quick refresh: nightly (~400 cards from your decks)<br/>
                  Bulk import: weekly (~30,000 all Magic cards)
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-neutral-800 p-4">
        <h2 className="text-lg font-semibold mb-3">Diagnosis</h2>
        <div className="space-y-2 text-sm">
          {publicDecks.length === 0 && (
            <div className="text-amber-500">⚠️ No public decks found - deck trends require public decks to display on profile</div>
          )}
          {totalDeckCards === 0 && (
            <div className="text-amber-500">⚠️ No deck cards found - radar chart requires actual card data</div>
          )}
          {!scryfallTest?.success && (
            <div className="text-red-500">❌ Scryfall API failed - color pie requires Scryfall data for color identity</div>
          )}
          {publicDecks.length > 0 && totalDeckCards > 0 && scryfallTest?.success && (
            <div className="text-green-500">✅ All required data sources appear to be working</div>
          )}
        </div>
      </section>

      <div className="text-center">
        <a href="/profile" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Back to Profile
        </a>
      </div>
    </main>
  );
}