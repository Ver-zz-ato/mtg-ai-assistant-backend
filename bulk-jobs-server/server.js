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
    
    // Stream and process cards
    const cardsResp = await fetch(defaultCardsEntry.download_uri);
    const cards = await cardsResp.json();
    
    console.log(`📊 Processing ${cards.length} cards...`);
    
    // Process in batches of 1000
    const batchSize = 1000;
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
        console.log(`✅ Processed ${processed}/${cards.length} cards (${Math.round(processed/cards.length*100)}%)`);
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
    console.log('🚀 Starting bulk price import...');
    
    // Get Scryfall bulk data URL
    const bulkDataResp = await fetch('https://api.scryfall.com/bulk-data');
    const bulkData = await bulkDataResp.json();
    const defaultCardsEntry = bulkData.data.find(d => d.type === 'default_cards');
    
    if (!defaultCardsEntry) {
      throw new Error('Could not find default_cards bulk data');
    }
    
    console.log('📥 Downloading bulk data for prices...');
    
    const cardsResp = await fetch(defaultCardsEntry.download_uri);
    const cards = await cardsResp.json();
    
    console.log(`📊 Processing prices for ${cards.length} cards...`);
    
    // Get existing cached cards
    const { data: cachedCards } = await supabase
      .from('scryfall_cache')
      .select('name');
    
    const cachedNames = new Set(cachedCards?.map(c => c.name) || []);
    
    // Filter to only cards in cache
    const cardsToUpdate = cards.filter(card => cachedNames.has(card.name));
    
    console.log(`🎯 Updating prices for ${cardsToUpdate.length} cached cards...`);
    
    // Process in batches
    const batchSize = 1000;
    let processed = 0;
    
    for (let i = 0; i < cardsToUpdate.length; i += batchSize) {
      const batch = cardsToUpdate.slice(i, i + batchSize);
      const rows = batch.map(card => ({
        name: card.name,
        usd: card.prices?.usd || null,
        usd_foil: card.prices?.usd_foil || null,
        eur: card.prices?.eur || null,
        tix: card.prices?.tix || null,
      }));
      
      const { error } = await supabase.from('scryfall_cache').upsert(rows, {
        onConflict: 'name',
        ignoreDuplicates: false
      });
      
      if (error) {
        console.error(`❌ Error in batch ${i}-${i + batchSize}:`, error);
      } else {
        processed += rows.length;
        console.log(`✅ Updated ${processed}/${cardsToUpdate.length} prices (${Math.round(processed/cardsToUpdate.length*100)}%)`);
      }
    }
    
    console.log(`🎉 Bulk price import completed! Updated ${processed} cards`);
    
  } catch (error) {
    console.error('❌ Bulk price import failed:', error);
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
    console.log('🚀 Starting price snapshot...');
    
    const today = new Date().toISOString().split('T')[0];
    
    // Get all cards with prices from cache
    const { data: cards, error: fetchError } = await supabase
      .from('scryfall_cache')
      .select('name, usd, usd_foil, eur, tix')
      .not('usd', 'is', null);
    
    if (fetchError) {
      throw new Error(`Failed to fetch cards: ${fetchError.message}`);
    }
    
    console.log(`📊 Creating snapshots for ${cards.length} cards...`);
    
    // Create snapshot rows
    const snapshots = cards.map(card => ({
      card_name: card.name,
      date: today,
      usd: card.usd ? parseFloat(card.usd) : null,
      usd_foil: card.usd_foil ? parseFloat(card.usd_foil) : null,
      eur: card.eur ? parseFloat(card.eur) : null,
      tix: card.tix ? parseFloat(card.tix) : null,
    }));
    
    // Insert in batches
    const batchSize = 1000;
    let processed = 0;
    
    for (let i = 0; i < snapshots.length; i += batchSize) {
      const batch = snapshots.slice(i, i + batchSize);
      
      const { error } = await supabase.from('price_snapshots').upsert(batch, {
        onConflict: 'card_name,date',
        ignoreDuplicates: true
      });
      
      if (error) {
        console.error(`❌ Error in batch ${i}-${i + batchSize}:`, error);
      } else {
        processed += batch.length;
        console.log(`✅ Inserted ${processed}/${snapshots.length} snapshots (${Math.round(processed/snapshots.length*100)}%)`);
      }
    }
    
    console.log(`🎉 Price snapshot completed! Inserted ${processed} snapshots for ${today}`);
    
  } catch (error) {
    console.error('❌ Price snapshot failed:', error);
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

