const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// Enable CORS so your Next.js app (localhost:3000) can call this
app.use(cors());
app.use(express.json());

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';

console.log('🚀 MTG Bulk Jobs Server starting...');
console.log(`📍 Supabase URL: ${SUPABASE_URL}`);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'Bulk jobs server is running', timestamp: new Date().toISOString() });
});

// Bulk Scryfall import endpoint
app.post('/bulk-scryfall', async (req, res) => {
  const authHeader = req.headers['x-cron-key'];
  
  // Simple auth check
  if (authHeader !== 'Boobies') {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  console.log('🎨 Starting Bulk Scryfall import...');
  
  try {
    // Step 1: Download the bulk data from Scryfall
    console.log('📥 Downloading bulk data from Scryfall...');
    const bulkRes = await fetch('https://api.scryfall.com/bulk-data');
    const bulkData = await bulkRes.json();
    
    // Find the "Default Cards" bulk data
    const defaultCards = bulkData.data.find(b => b.type === 'default_cards');
    if (!defaultCards) {
      throw new Error('Could not find default_cards bulk data');
    }
    
    console.log(`📦 Downloading from: ${defaultCards.download_uri}`);
    console.log(`📊 Expected size: ~${(defaultCards.size / 1024 / 1024).toFixed(2)}MB`);
    
    const cardsRes = await fetch(defaultCards.download_uri);
    const allCards = await cardsRes.json();
    
    console.log(`✅ Downloaded ${allCards.length} cards`);
    
    // Step 2: Insert into Supabase
    console.log('💾 Inserting into scryfall_cache table...');
    
    let inserted = 0;
    let updated = 0;
    const batchSize = 100;
    
    for (let i = 0; i < allCards.length; i += batchSize) {
      const batch = allCards.slice(i, i + batchSize);
      
      // Transform Scryfall data to match your table schema
      const rows = batch.map(card => ({
        id: card.id,
        name: card.name,
        mana_cost: card.mana_cost || null,
        cmc: card.cmc || 0,
        type_line: card.type_line || '',
        oracle_text: card.oracle_text || null,
        colors: card.colors || [],
        color_identity: card.color_identity || [],
        set_code: card.set || '',
        set_name: card.set_name || '',
        rarity: card.rarity || 'common',
        collector_number: card.collector_number || '',
        image_uri: card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null,
        legalities: card.legalities || {},
        // Add other fields as needed
      }));
      
      // Upsert batch
      const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/scryfall_cache`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(rows)
      });
      
      if (!upsertRes.ok) {
        const error = await upsertRes.text();
        console.error(`❌ Batch ${i / batchSize + 1} failed:`, error);
        continue;
      }
      
      inserted += batch.length;
      
      if ((i / batchSize) % 10 === 0) {
        console.log(`⏳ Progress: ${inserted}/${allCards.length} (${((inserted / allCards.length) * 100).toFixed(1)}%)`);
      }
    }
    
    console.log(`✅ Bulk import complete! Processed ${allCards.length} cards, inserted/updated ${inserted}`);
    
    res.json({
      ok: true,
      message: 'Bulk Scryfall import completed',
      processed: allCards.length,
      inserted,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Bulk Scryfall import failed:', error);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🔗 Test with: curl http://localhost:${PORT}/health`);
  console.log(`\n💡 To run bulk Scryfall import:`);
  console.log(`   curl -X POST -H "x-cron-key: Boobies" http://localhost:${PORT}/bulk-scryfall`);
});

