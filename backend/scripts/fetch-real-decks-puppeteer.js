// backend/scripts/fetch-real-decks-puppeteer.js
// Uses Puppeteer to render pages like a real browser (bypasses 403 errors)

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Try to load .env.local from multiple locations
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const frontendDir = path.join(projectRoot, 'frontend');

const envPaths = [
  path.join(frontendDir, '.env.local'),
  path.join(projectRoot, '.env.local'),
  path.join(__dirname, '.env.local'),
  '.env.local'
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  dotenv.config({ path: '.env.local' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Check if Puppeteer is available
let puppeteer;
try {
  puppeteer = await import('puppeteer');
} catch (error) {
  console.error('❌ Puppeteer not installed. Install it with:');
  console.error('   npm install puppeteer');
  console.error('\nOr use the regular fetch script: node scripts/fetch-real-decks.js');
  process.exit(1);
}

async function fetchMoxfieldDeckWithPuppeteer(deckId) {
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set a realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to the deck page
    const url = `https://www.moxfield.com/decks/${deckId}`;
    console.log(`  Loading: ${url}`);
    
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait for deck data to load
    await page.waitForTimeout(2000);
    
    // Extract deck data from the page
    const deckData = await page.evaluate(() => {
      // Try to get deck data from window object
      if (window.__MOXFIELD_DEALERSHIP__) {
        return window.__MOXFIELD_DEALERSHIP__.deck || window.__MOXFIELD_DEALERSHIP__;
      }
      if (window.__INITIAL_STATE__) {
        return window.__INITIAL_STATE__.deck || window.__INITIAL_STATE__;
      }
      if (window.deckData) {
        return window.deckData;
      }
      return null;
    });
    
    if (!deckData) {
      throw new Error('Could not extract deck data from page');
    }
    
    return deckData;
  } finally {
    await browser.close();
  }
}

function parseMoxfieldDeck(moxDeck) {
  if (!moxDeck || !moxDeck.commanders || !moxDeck.mainboard) {
    return null;
  }
  
  const commander = moxDeck.commanders[0]?.card?.name || Object.keys(moxDeck.commanders)[0];
  if (!commander) return null;
  
  let deckText = `${commander}\n`;
  const cards = [];
  let totalCards = 0;
  
  for (const [cardName, cardData] of Object.entries(moxDeck.mainboard)) {
    const qty = cardData?.quantity || 1;
    if (qty > 0 && cardName !== commander) {
      deckText += `${qty} ${cardName}\n`;
      cards.push({ name: cardName, qty });
      totalCards += qty;
    }
  }
  
  totalCards += 1; // For the commander
  
  if (totalCards !== 100) {
    console.warn(`⚠ Deck has ${totalCards} cards (expected 100), skipping`);
    return null;
  }
  
  const colors = moxDeck.colors || [];
  
  return {
    commander,
    deckText,
    cards,
    colors,
    title: moxDeck.name || `${commander} - ${moxDeck.format || 'Commander'}`,
    description: moxDeck.description || '',
  };
}

async function addCuratedDecks() {
  let curatedDeckIds = [];
  try {
    const filePath = path.join(__dirname, 'moxfield-deck-ids.json');
    const deckIdsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    curatedDeckIds = deckIdsData.deckIds.filter(id => id && typeof id === 'string' && !id.startsWith('Example') && !id.includes('Add real'));
  } catch (error) {
    console.log('⚠ No moxfield-deck-ids.json found');
    return;
  }
  
  if (curatedDeckIds.length === 0) {
    console.log('⚠ No deck IDs found in moxfield-deck-ids.json');
    return;
  }
  
  const userId = 'b8c7d6e5-f4a3-4210-9d00-000000000001';
  let totalDecks = 0;
  let skipped = 0;
  
  console.log(`\n📦 Fetching ${curatedDeckIds.length} curated decks from Moxfield using Puppeteer...\n`);
  
  for (const deckId of curatedDeckIds) {
    try {
      console.log(`Fetching deck: ${deckId}...`);
      const moxDeck = await fetchMoxfieldDeckWithPuppeteer(deckId);
      const parsed = parseMoxfieldDeck(moxDeck);
      
      if (!parsed) {
        console.log(`  ⊘ Invalid format, skipping`);
        skipped++;
        continue;
      }
      
      const totalCards = parsed.cards.reduce((sum, c) => sum + c.qty, 0) + 1;
      if (totalCards !== 100) {
        console.log(`  ⊘ Has ${totalCards} cards (expected 100), skipping`);
        skipped++;
        continue;
      }
      
      // Check if deck already exists
      const { data: existing } = await supabase
        .from('decks')
        .select('id')
        .eq('title', parsed.title)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (existing) {
        console.log(`  ⊘ Already exists: ${parsed.title}`);
        skipped++;
        continue;
      }
      
      // Insert deck
      const { data: deck, error: deckError } = await supabase
        .from('decks')
        .insert({
          user_id: userId,
          title: parsed.title,
          format: 'Commander',
          plan: 'Optimized',
          colors: parsed.colors,
          currency: 'USD',
          deck_text: parsed.deckText,
          commander: parsed.commander,
          is_public: true,
          public: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (deckError) {
        console.error(`  ✗ Error: ${deckError.message}`);
        skipped++;
        continue;
      }
      
      // Insert cards
      for (const card of parsed.cards) {
        await supabase
          .from('deck_cards')
          .insert({
            deck_id: deck.id,
            name: card.name,
            qty: card.qty,
          })
          .catch(() => {});
      }
      
      // Insert commander
      await supabase
        .from('deck_cards')
        .insert({
          deck_id: deck.id,
          name: parsed.commander,
          qty: 1,
        })
        .catch(() => {});
      
      totalDecks++;
      console.log(`  ✓ Created: ${parsed.title} (100 cards)`);
      
      // Rate limiting - wait 2 seconds between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      skipped++;
    }
  }
  
  console.log(`\n✅ Done! Created ${totalDecks} decks, skipped ${skipped}.`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addCuratedDecks().catch(console.error);
}

export { addCuratedDecks };
