const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Initialize Supabase Admin Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Auth middleware
function checkAuth(req, res, next) {
  const cronKey = process.env.CRON_KEY;
  const headerKey = req.headers['x-cron-key'];
  
  if (!cronKey || !headerKey || headerKey !== cronKey) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  
  next();
}

// Helper function for normalization
function norm(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'bulk-jobs-server', timestamp: new Date().toISOString() });
});

// 1. BULK SCRYFALL IMPORT
app.post('/bulk-scryfall', checkAuth, async (req, res) => {
  console.log('🔥 Bulk Scryfall import started');
  
  try {
    // Return 202 Accepted immediately
    res.status(202).json({ 
      ok: true, 
      message: 'Bulk Scryfall import started',
      note: 'Job running in background, will take 3-10 minutes'
    });
    
    // Run job in background
    runBulkScryfallImport();
    
  } catch (error) {
    console.error('❌ Bulk Scryfall import failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
});

async function runBulkScryfallImport() {
  try {
    console.log('🚀 Starting bulk Scryfall import...');
    
    // Get Scryfall bulk data URL
    const bulkDataResp = await fetch('https://api.scryfall.com/bulk-data');
    const bulkData = await bulkDataResp.json();
    const defaultCardsEntry = bulkData.data.find(d => d.type === 'default_cards');
    
    if (!defaultCardsEntry) {
      throw new Error('Could not find default_cards bulk data');
    }
    
    console.log('📥 Downloading bulk data from:', defaultCardsEntry.download_uri);
    console.log('⚠️ Memory optimization: Processing in small batches to fit 512MB limit');
    
    // Fetch data but process in chunks to avoid memory overflow
    const cardsResp = await fetch(defaultCardsEntry.download_uri);
    const cards = await cardsResp.json();
    
    console.log(`📊 Processing ${cards.length} cards in memory-efficient batches...`);
    
    // Process in SMALLER batches of 500 and clear memory aggressively
    const batchSize = 500;
    let processed = 0;
    
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize);
      const rows = batch.map(card => ({
        name: card.name,
        oracle_text: card.oracle_text || null,
        type_line: card.type_line || null,
        mana_cost: card.mana_cost || null,
        cmc: card.cmc || 0,
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        rarity: card.rarity || null,
        set: card.set || null,
        collector_number: card.collector_number || null,
        small: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
        normal: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null,
        art_crop: card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop || null,
      }));
      
      const { error } = await supabase.from('scryfall_cache').upsert(rows, {
        onConflict: 'name',
        ignoreDuplicates: false
      });
      
      if (error) {
        console.error(`❌ Error in batch ${i}-${i + batchSize}:`, error);
      } else {
        processed += rows.length;
        if (processed % 5000 === 0 || processed === cards.length) {
          console.log(`✅ Processed ${processed}/${cards.length} cards (${Math.round(processed/cards.length*100)}%)`);
        }
      }
      
      // Force garbage collection hint every 10 batches
      if (i % (batchSize * 10) === 0) {
        if (global.gc) global.gc();
      }
    }
    
    console.log(`🎉 Bulk Scryfall import completed! Processed ${processed} cards`);
    
  } catch (error) {
    console.error('❌ Bulk Scryfall import failed:', error);
  }
}

// 2. BULK PRICE IMPORT
app.post('/bulk-price-import', checkAuth, async (req, res) => {
  console.log('💰 Bulk price import started');
  
  try {
    res.status(202).json({ 
      ok: true, 
      message: 'Bulk price import started',
      note: 'Job running in background, will take 3-5 minutes'
    });
    
    runBulkPriceImport();
    
  } catch (error) {
    console.error('❌ Bulk price import failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
});

async function runBulkPriceImport() {
  try {
    console.log('🚀 Starting lightweight price refresh...');
    console.log('💡 This uses Scryfall API (no bulk download) to update existing price_cache entries');
    
    // Get all cards from price_cache that need updating (older than 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: staleCards, error: fetchError } = await supabase
      .from('price_cache')
      .select('card_name')
      .or(`updated_at.lt.${yesterday},updated_at.is.null`)
      .limit(1000); // Only refresh 1000 cards per run to stay within memory
    
    if (fetchError) {
      throw new Error(`Failed to fetch stale prices: ${fetchError.message}`);
    }
    
    if (!staleCards || staleCards.length === 0) {
      console.log('✅ All prices are up to date!');
      return;
    }
    
    console.log(`🎯 Found ${staleCards.length} cards needing price updates`);
    
    // Update prices in chunks of 75 (Scryfall API limit)
    const chunkSize = 75;
    let updated = 0;
    
    for (let i = 0; i < staleCards.length; i += chunkSize) {
      const chunk = staleCards.slice(i, i + chunkSize);
      const identifiers = chunk.map(c => ({ name: c.card_name }));
      
      try {
        const response = await fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers })
        });
        
        if (!response.ok) {
          console.warn(`⚠️ Scryfall API error for chunk ${i}:`, response.status);
          continue;
        }
        
        const result = await response.json();
        const cards = result.data || [];
        
        // Update price_cache with fresh prices (using bulk import schema)
        const rows = cards.map(card => ({
          card_name: card.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim(),
          usd_price: card.prices?.usd ? parseFloat(card.prices.usd) : null,
          usd_foil_price: card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : null,
          eur_price: card.prices?.eur ? parseFloat(card.prices.eur) : null,
          tix_price: card.prices?.tix ? parseFloat(card.prices.tix) : null,
          updated_at: new Date().toISOString()
        }));
        
        const { error: upsertError } = await supabase
          .from('price_cache')
          .upsert(rows, { onConflict: 'card_name' });
        
        if (upsertError) {
          console.error(`❌ Error updating chunk ${i}:`, upsertError.message);
        } else {
          updated += rows.length;
          console.log(`✅ Updated ${updated}/${staleCards.length} prices`);
        }
        
        // Rate limit: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (chunkError) {
        console.error(`❌ Error processing chunk ${i}:`, chunkError.message);
      }
    }
    
    console.log(`🎉 Price refresh completed! Updated ${updated}/${staleCards.length} prices`);
    
  } catch (error) {
    console.error('❌ Price refresh failed:', error);
    throw error;
  }
}

// 3. PRICE SNAPSHOT BULK
app.post('/price-snapshot', checkAuth, async (req, res) => {
  console.log('📈 Price snapshot started');
  
  try {
    res.status(202).json({ 
      ok: true, 
      message: 'Price snapshot started',
      note: 'Job running in background, will take 5-10 minutes'
    });
    
    runPriceSnapshot();
    
  } catch (error) {
    console.error('❌ Price snapshot failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: error.message });
    }
  }
});

async function runPriceSnapshot() {
  try {
    console.log('🚀 Starting lightweight price snapshot...');
    console.log('💡 This uses existing price_cache data (no bulk download)');
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get all cards with prices from price_cache (using bulk import schema)
    const { data: cards, error: fetchError } = await supabase
      .from('price_cache')
      .select('card_name, usd_price, eur_price')
      .not('usd_price', 'is', null);
    
    if (fetchError) {
      throw new Error(`Failed to fetch prices: ${fetchError.message}`);
    }
    
    console.log(`📊 Creating snapshots for ${cards.length} cards...`);
    
    // Create snapshot rows in price_snapshots format:
    // Each card gets 2 rows (USD, EUR) - no GBP in bulk schema
    const snapshots = [];
    for (const card of cards) {
      if (card.usd_price) {
        snapshots.push({
          snapshot_date: today,
          name_norm: card.card_name,
          currency: 'USD',
          unit: parseFloat(card.usd_price),
          source: 'PriceCache'
        });
      }
      if (card.eur_price) {
        snapshots.push({
          snapshot_date: today,
          name_norm: card.card_name,
          currency: 'EUR',
          unit: parseFloat(card.eur_price),
          source: 'PriceCache'
        });
      }
    }
    
    console.log(`📦 Generated ${snapshots.length} snapshot rows (USD+EUR)`);
    
    // Insert in batches
    const batchSize = 1000;
    let processed = 0;
    
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      
      const { error } = await supabase.from('price_snapshots').upsert(batch, {
        onConflict: 'snapshot_date,name_norm,currency',
        ignoreDuplicates: true
      });
      
      if (error) {
        console.error(`❌ Error in batch ${i}-${i + batchSize}:`, error.message);
      } else {
        processed += batch.length;
        console.log(`✅ Inserted ${processed}/${snapshots.length} snapshots (${Math.round(processed/snapshots.length*100)}%)`);
      }
    }
    
    console.log(`🎉 Price snapshot completed! Inserted ${processed} snapshots for ${today}`);
    
  } catch (error) {
    console.error('❌ Price snapshot failed:', error);
    throw error;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Bulk Jobs Server running on port ${PORT}`);
  console.log(`📍 Endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   POST /bulk-scryfall`);
  console.log(`   POST /bulk-price-import`);
  console.log(`   POST /price-snapshot`);
});

