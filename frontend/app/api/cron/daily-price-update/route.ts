import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 180; // 3 minutes - longer for price updates

interface ScryfallPricing {
  usd?: string;
  usd_foil?: string;
  eur?: string;
  tix?: string;
}

interface ScryfallCard {
  name: string;
  prices?: ScryfallPricing;
}

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  console.log("💰 Daily price update endpoint called");
  
  let actor: string | null = null;
  
  try {
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = req.headers.get("x-cron-key") || "";
    console.log("🔑 Auth check - cronKey exists:", !!cronKey, "header exists:", !!hdr);

    let useAdmin = false;

    if (cronKey && hdr === cronKey) {
      useAdmin = true;
      actor = 'cron';
      console.log("✅ Cron key auth successful");
    } else {
      console.log("🔍 Trying user auth...");
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isAdmin(user)) {
          useAdmin = true;
          actor = user.id as string;
          console.log("✅ Admin user auth successful");
        }
      } catch (authError: any) {
        console.log("❌ User auth failed:", authError.message);
      }
    }

    if (!useAdmin) {
      console.log("❌ Authorization failed");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    console.log("🚀 Authorization successful, starting daily price update...");
  } catch (setupError: any) {
    console.error("💥 Setup error:", setupError);
    return NextResponse.json({ 
      ok: false, 
      error: "setup_failed",
      details: setupError.message 
    }, { status: 500 });
  }

  try {
    console.log("💰 Starting daily price update...");
    const startTime = Date.now();

    // Check if this is a test run
    const testMode = req.headers.get('x-test-mode') === 'true';
    if (testMode) {
      console.log("🧪 Test mode - validating connections only");
      
      const admin = getAdmin();
      if (!admin) {
        throw new Error("Admin client not available");
      }
      
      const { data, error } = await admin.from('scryfall_cache').select('name').limit(1);
      if (error) {
        throw new Error(`Database test failed: ${error.message}`);
      }
      
      return NextResponse.json({ 
        ok: true, 
        test_mode: true,
        database_ok: true,
        sample_cache_entries: data?.length || 0,
        message: "Test successful - ready for price updates"
      });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    // Get batch parameters
    const batchSize = parseInt(req.headers.get('x-batch-size') || '100'); // Small batches for API limits
    const pageNum = parseInt(req.headers.get('x-page') || '1');
    const maxCards = parseInt(req.headers.get('x-max-cards') || '500'); // Daily limit to avoid hitting API limits
    
    console.log(`💰 Processing daily price update: page ${pageNum}, batch size ${batchSize}, max ${maxCards} cards`);

    // Get a sample of cards from our cache that need price updates
    // Focus on recently added or popular cards, or random sample
    const offset = (pageNum - 1) * maxCards;
    const { data: cachedCards, error: cacheError } = await admin
      .from('scryfall_cache')
      .select('name')
      .order('updated_at', { ascending: false }) // Recently updated cards first
      .range(offset, offset + maxCards - 1);

    if (cacheError) {
      throw new Error(`Failed to fetch cached cards: ${cacheError.message}`);
    }

    if (!cachedCards || cachedCards.length === 0) {
      console.log("📄 No more cards to update");
      return NextResponse.json({
        ok: true,
        updated: 0,
        processed: 0,
        page: pageNum,
        has_more: false,
        message: "No more cards to update"
      });
    }

    console.log(`💰 Found ${cachedCards.length} cached cards to update prices for`);

    // Process cards in small batches to respect API limits
    let updated = 0;
    let processed = 0;
    let apiCalls = 0;
    const maxApiCalls = 50; // Conservative API limit per run

    for (let i = 0; i < cachedCards.length && apiCalls < maxApiCalls; i += batchSize) {
      const batch = cachedCards.slice(i, i + batchSize);
      
      for (const cachedCard of batch) {
        if (apiCalls >= maxApiCalls) {
          console.log(`🛑 Reached API limit (${maxApiCalls} calls), stopping for this run`);
          break;
        }

        try {
          // Fetch individual card data from Scryfall
          const searchUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cachedCard.name)}`;
          console.log(`🔍 Fetching price for: ${cachedCard.name}`);
          
          const cardResponse = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'MTG-AI-Assistant/1.0'
            }
          });
          
          apiCalls++;
          
          if (!cardResponse.ok) {
            if (cardResponse.status === 404) {
              console.log(`⚠️ Card not found: ${cachedCard.name}`);
              processed++;
              continue;
            }
            throw new Error(`API error for ${cachedCard.name}: ${cardResponse.status} ${cardResponse.statusText}`);
          }

          const cardData: ScryfallCard = await cardResponse.json();
          
          if (cardData.prices) {
            // Update price cache
            const priceData = {
              card_name: norm(cachedCard.name),
              usd_price: cardData.prices.usd ? parseFloat(cardData.prices.usd) : null,
              usd_foil_price: cardData.prices.usd_foil ? parseFloat(cardData.prices.usd_foil) : null,
              eur_price: cardData.prices.eur ? parseFloat(cardData.prices.eur) : null,
              tix_price: cardData.prices.tix ? parseFloat(cardData.prices.tix) : null,
              updated_at: new Date().toISOString()
            };

            const { error: priceError } = await admin
              .from('price_cache')
              .upsert([priceData], { 
                onConflict: 'card_name',
                ignoreDuplicates: false 
              });

            if (priceError) {
              console.error(`❌ Price update failed for ${cachedCard.name}:`, priceError.message);
            } else {
              updated++;
              console.log(`✅ Updated price for: ${cachedCard.name}`);
            }
          }

          processed++;
          
          // Small delay to be respectful to Scryfall API
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay

        } catch (cardError: any) {
          console.error(`❌ Error processing ${cachedCard.name}:`, cardError.message);
          processed++;
          continue;
        }
      }
      
      // Longer delay between batches
      if (i + batchSize < cachedCards.length && apiCalls < maxApiCalls) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between batches
      }
    }

    // Record progress
    try {
      await admin.from('admin_audit').insert({ 
        actor_id: actor || 'cron', 
        action: 'daily_price_update', 
        target: updated,
        details: `page_${pageNum}_${processed}_processed_${apiCalls}_api_calls` 
      });
    } catch (auditError) {
      console.warn("⚠️ Audit logging failed:", auditError);
    }

    const duration = Date.now() - startTime;
    const hasMore = cachedCards.length === maxCards && apiCalls < maxApiCalls;
    
    console.log(`✅ Daily price update completed in ${duration}ms: ${updated} prices updated, ${apiCalls} API calls made`);

    return NextResponse.json({ 
      ok: true, 
      updated: updated, 
      processed: processed,
      api_calls_made: apiCalls,
      page: pageNum,
      batch_size: batchSize,
      cards_in_batch: cachedCards.length,
      has_more: hasMore,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("❌ Daily price update failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "daily_price_update_failed" 
    }, { status: 500 });
  }
}