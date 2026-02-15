// backend/scripts/fetch-real-decks.js
// Fetches real Commander decklists from Moxfield public decks
// Uses popular commanders and fetches actual 100-card decklists

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Try to load .env.local from multiple locations
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..'); // Go up from scripts/backend to project root
const frontendDir = path.join(projectRoot, 'frontend');

// Try these locations in order
const envPaths = [
  path.join(frontendDir, '.env.local'),  // frontend/.env.local (most common)
  path.join(projectRoot, '.env.local'),  // root/.env.local
  path.join(__dirname, '.env.local'),    // backend/scripts/.env.local
  '.env.local'                            // current directory
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✓ Loaded environment from: ${envPath}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('⚠ No .env.local found in common locations. Trying default...');
  dotenv.config({ path: '.env.local' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Create .env.local in frontend/ or project root with these variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Popular commanders to search for on Moxfield
const POPULAR_COMMANDERS = [
  'Atraxa, Praetors Voice',
  'The Ur-Dragon',
  'Edgar Markov',
  'Yuriko, the Tigers Shadow',
  'Krenko, Mob Boss',
  'Meren of Clan Nel Toth',
  'Chulane, Teller of Tales',
  'Korvold, Fae-Cursed King',
  'Prosper, Tome-Bound',
  'Kenrith, the Returned King',
  'Ghave, Guru of Spores',
  'Muldrotha, the Gravetide',
  'Breya, Etherium Shaper',
  'Yawgmoth, Thran Physician',
  'The Gitrog Monster',
  'Kess, Dissident Mage',
  'Thrasios, Triton Hero',
  'Tymna the Weaver',
  'Najeela, the Blade-Blossom',
  'Miirym, Sentinel Wyrm',
  'Kinnan, Bonder Prodigy',
  'Niv-Mizzet, Parun',
  'Jodah, Archmage Eternal',
  'Kaalia of the Vast',
  'Sisay, Weatherlight Captain',
  'Zur the Enchanter',
  'Narset, Enlightened Master',
  'Omnath, Locus of Creation',
  'Omnath, Locus of Rage',
  'Jhoira, Weatherlight Captain',
  'Sliver Overlord',
  'The First Sliver',
  'Aesi, Tyrant of Gyre Strait',
  'Tatyova, Benthic Druid',
  'Lathril, Blade of the Elves',
  'Wilhelt, the Rotcleaver',
  'Gishath, Suns Avatar',
  'Pantlaza, Sun-Favored',
  'Etali, Primal Conqueror',
  'Zacama, Primal Calamity',
  'Queen Marchesa',
  'Tasigur, the Golden Fang',
  'Derevi, Empyrial Tactician',
  'Prossh, Skyraider of Kher',
  'Marath, Will of the Wild',
  'Oloro, Ageless Ascetic',
  'Roon of the Hidden Realm',
  'Sharuum the Hegemon',
  'Animar, Soul of Elements',
  'Karador, Ghost Chieftain',
  'Riku of Two Reflections',
  'The Scarab God',
  'The Locust God',
  'Neheb, the Eternal',
  'Godo, Bandit Warlord',
  'Purphoros, God of the Forge',
  'Rakdos, Lord of Riots',
  'Alesha, Who Smiles at Death',
  'Shu Yun, the Silent Tempest',
  'Sydri, Galvanic Genius',
  'Jeleva, Nephalias Scourge',
  'The Mimeoplasm',
  'Zedruu the Greathearted',
  'Grimgrin, Corpse-Born',
  'Yshtola, Nights Blessed',
  'Vivi Ornitier',
  'Teval, the Balanced Scale',
  'Kefka, Court Mage',
  'Sephiroth, Fabled SOLDIER',
  'Fire Lord Azula',
];

// Moxfield public deck IDs for popular commanders (you can find these by searching Moxfield)
// Format: { commander: 'Name', deckIds: ['moxfield-deck-id-1', 'moxfield-deck-id-2', ...] }
const MOXFIELD_DECK_IDS = {
  // These are example deck IDs - you'll need to find real ones from Moxfield
  // Search: https://www.moxfield.com/decks?q=commander:Atraxa%20Praetors%20Voice&sort=popular
  // Then extract deck IDs from URLs like: https://www.moxfield.com/decks/{deckId}
};

async function fetchMoxfieldDeck(deckId) {
  // Try web scraping first (more reliable than API)
  try {
    return await scrapeMoxfieldDeck(deckId);
  } catch (scrapeError) {
    console.log(`  ⚠ Scraping failed: ${scrapeError.message}, trying API...`);
    
    // Fallback to API
    try {
      const url = `https://api.moxfield.com/v2/decks/all/${deckId}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.moxfield.com/',
          'Origin': 'https://www.moxfield.com',
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site'
        }
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(`Access forbidden (403) - Moxfield may be blocking automated requests`);
        }
        if (response.status === 404) {
          throw new Error(`Deck not found (404) - deck may be private or ID is invalid`);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Validate we got deck data
      if (!data || !data.mainboard) {
        throw new Error('Invalid API response format');
      }
      
      return data;
    } catch (apiError) {
      throw new Error(`Both scraping and API failed. Last error: ${apiError.message}`);
    }
  }
}

async function scrapeMoxfieldDeck(deckId) {
  try {
    const url = `https://www.moxfield.com/decks/${deckId}`;
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.moxfield.com/',
        'Origin': 'https://www.moxfield.com',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Try multiple patterns for embedded deck data
    // Pattern 1: window.__MOXFIELD_DEALERSHIP__ (most common)
    let match = html.match(/window\.__MOXFIELD_DEALERSHIP__\s*=\s*({[\s\S]+?});\s*(?:<\/script>|$)/);
    if (match) {
      try {
        const jsonStr = match[1];
        const data = JSON.parse(jsonStr);
        if (data.deck) return data.deck;
        if (data.mainboard) return data;
        // Sometimes it's nested
        if (data.data && data.data.deck) return data.data.deck;
      } catch (e) {
        console.log(`  ⚠ Failed to parse __MOXFIELD_DEALERSHIP__: ${e.message}`);
      }
    }
    
    // Pattern 2: Look for deck data in script tags with different variable names
    const scriptPatterns = [
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?});/,
      /window\.__NEXT_DATA__\s*=\s*({[\s\S]+?});/,
      /window\.deckData\s*=\s*({[\s\S]+?});/,
      /const\s+deckData\s*=\s*({[\s\S]+?});/,
    ];
    
    for (const pattern of scriptPatterns) {
      match = html.match(pattern);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          if (data.deck) return data.deck;
          if (data.props && data.props.deck) return data.props.deck;
          if (data.decks && data.decks[deckId]) return data.decks[deckId];
          if (data.mainboard) return data;
        } catch (e) {
          // Continue to next pattern
        }
      }
    }
    
    // Pattern 3: Look for JSON-LD structured data
    match = html.match(/"@type":\s*"Deck"[\s\S]*?"mainboard":\s*({[\s\S]+?})/);
    if (match) {
      try {
        const data = JSON.parse(`{${match[0]}}`);
        return data;
      } catch (e) {
        // Continue
      }
    }
    
    // Pattern 4: Try to find any large JSON object with mainboard/commanders
    // Look for objects that are likely deck data (have both mainboard and commanders)
    const largeJsonMatches = html.match(/\{[^{}]*(?:"mainboard"|"commanders")[^{}]*\}/g);
    if (largeJsonMatches) {
      for (const jsonStr of largeJsonMatches) {
        try {
          const data = JSON.parse(jsonStr);
          if ((data.mainboard || data.commanders) && Object.keys(data).length > 2) {
            return data;
          }
        } catch (e) {
          // Continue to next match
        }
      }
    }
    
    // Debug: Save HTML snippet if we can't parse
    const snippet = html.substring(0, 2000);
    console.log(`  ⚠ HTML snippet (first 2000 chars): ${snippet.substring(0, 500)}...`);
    
    throw new Error('Could not extract deck data from page - page structure may have changed or requires JavaScript rendering');
  } catch (error) {
    throw new Error(`Failed to fetch deck ${deckId}: ${error.message}`);
  }
}

function parseMoxfieldDeck(moxDeck) {
  if (!moxDeck || !moxDeck.commanders || !moxDeck.mainboard) {
    return null;
  }
  
  const commander = moxDeck.commanders[0]?.card?.name;
  if (!commander) return null;
  
  // Build deck text
  let deckText = `${commander}\n`;
  const cards = [];
  let totalCards = 0;
  
  // Parse mainboard
  for (const [cardName, cardData] of Object.entries(moxDeck.mainboard)) {
    const qty = cardData?.quantity || 1;
    if (qty > 0 && cardName !== commander) {
      deckText += `${qty} ${cardName}\n`;
      cards.push({ name: cardName, qty });
      totalCards += qty;
    }
  }
  
  // Add commander to count
  totalCards += 1;
  
  // Validate it's exactly 100 cards
  if (totalCards !== 100) {
    console.warn(`⚠ Deck has ${totalCards} cards (expected 100), skipping`);
    return null;
  }
  
  // Extract colors from commander or deck
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

async function searchMoxfieldForCommander(commanderName) {
  try {
    // Moxfield search endpoint
    const searchUrl = `https://api.moxfield.com/v2/decks/search?q=${encodeURIComponent(`commander:"${commanderName}"`)}&sort=popularity&page=1&pageSize=10`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'ManaTap-AI-Deck-Importer/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.warn(`Search API failed for ${commanderName}, trying web scrape...`);
    // Fallback: could scrape search results page
    return null;
  }
}

async function addRealDecks() {
  const userId = 'b8c7d6e5-f4a3-4210-9d00-000000000001';
  let totalDecks = 0;
  let skipped = 0;
  
  console.log('Fetching real decklists from Moxfield...\n');
  
  // Option 1: Use known Moxfield deck IDs (if you have them)
  // Option 2: Search Moxfield for each commander and fetch top decks
  
  for (const commander of POPULAR_COMMANDERS.slice(0, 20)) { // Start with 20 to test
    try {
      console.log(`Searching for: ${commander}...`);
      
      // Try to search Moxfield
      const searchResults = await searchMoxfieldForCommander(commander).catch(() => null);
      
      if (!searchResults || !searchResults.data || searchResults.data.length === 0) {
        console.log(`  ⊘ No decks found for ${commander}`);
        skipped++;
        continue;
      }
      
      // Fetch top 3 decks for this commander
      const topDecks = searchResults.data.slice(0, 3);
      
      for (const deckResult of topDecks) {
        const deckId = deckResult.publicId || deckResult.id;
        if (!deckId) continue;
        
        try {
          console.log(`  Fetching deck: ${deckId}...`);
          const moxDeck = await fetchMoxfieldDeck(deckId);
          const parsed = parseMoxfieldDeck(moxDeck);
          
          if (!parsed) {
            console.log(`  ⊘ Invalid deck format, skipping`);
            continue;
          }
          
          // Check if deck already exists
          const { data: existing } = await supabase
            .from('decks')
            .select('id')
            .eq('title', parsed.title)
            .eq('user_id', userId)
            .single();
          
          if (existing) {
            console.log(`  ⊘ Already exists: ${parsed.title}`);
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
              .catch(() => {}); // Ignore conflicts
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
          
          // Rate limiting - wait 1 second between requests
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`  ✗ Error fetching deck ${deckId}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`✗ Error processing ${commander}:`, error.message);
    }
  }
  
  console.log(`\n✅ Done! Created ${totalDecks} decks, skipped ${skipped} commanders.`);
  console.log('\nNote: If Moxfield API is not accessible, you may need to:');
  console.log('1. Manually find popular deck IDs from moxfield.com');
  console.log('2. Add them to MOXFIELD_DECK_IDS object');
  console.log('3. Or use web scraping (with proper rate limiting and ToS compliance)');
}

// Alternative: Use a curated list of known good Moxfield deck IDs
// Alternative approach: Use manually curated decklists instead of Moxfield API
// See add-curated-decklists.js for a script that uses JSON file with decklists

async function addCuratedDecks() {
  // Load deck IDs from JSON file
  let curatedDeckIds = [];
  try {
    const fs = await import('fs');
    const path = await import('path');
    // Use __dirname equivalent for ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const filePath = path.join(__dirname, 'moxfield-deck-ids.json');
    const deckIdsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    curatedDeckIds = deckIdsData.deckIds.filter(id => id && typeof id === 'string' && !id.startsWith('Example'));
  } catch (error) {
    console.log('⚠ No moxfield-deck-ids.json found');
    console.log('Create backend/scripts/moxfield-deck-ids.json with an array of deck IDs');
    console.log('Example: { "deckIds": ["abc123", "def456", ...] }');
    return;
  }
  
  if (curatedDeckIds.length === 0) {
    console.log('⚠ No deck IDs found in moxfield-deck-ids.json');
    console.log('Add Moxfield deck IDs to the "deckIds" array');
    return;
  }
  
  const userId = 'b8c7d6e5-f4a3-4210-9d00-000000000001';
  let totalDecks = 0;
  let skipped = 0;
  
  console.log(`Fetching ${curatedDeckIds.length} curated decks from Moxfield...\n`);
  
  for (const deckId of curatedDeckIds) {
    try {
      console.log(`Fetching deck: ${deckId}...`);
      const moxDeck = await fetchMoxfieldDeck(deckId);
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
        .single();
      
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
          .catch(() => {}); // Ignore conflicts
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
      
      // Rate limiting - wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      skipped++;
    }
  }
  
  console.log(`\n✅ Done! Created ${totalDecks} decks, skipped ${skipped}.`);
}

// Run the script
if (process.argv.includes('--curated')) {
  addCuratedDecks().catch(console.error);
} else {
  addRealDecks().catch(console.error);
}
