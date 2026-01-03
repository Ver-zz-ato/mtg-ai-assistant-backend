// backend/scripts/import-decks-from-csv.js
// Imports Commander decks from a CSV file
// CSV format: Each row is a deck, columns can be: title, commander, decklist (or similar)

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

// Parse CSV file
function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  const decks = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const deck = {};
    
    headers.forEach((header, index) => {
      deck[header] = values[index] || '';
    });
    
    if (deck.commander || deck.title) {
      decks.push(deck);
    }
  }
  
  return { headers, decks };
}

// Parse decklist text (can be in various formats)
function parseDecklist(decklistText) {
  if (!decklistText) return { commander: null, cards: [], totalCards: 0 };
  
  const lines = decklistText.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//');
  });
  
  if (lines.length === 0) return { commander: null, cards: [], totalCards: 0 };
  
  // First line is usually the commander
  const commanderLine = lines[0].trim();
  const commanderMatch = commanderLine.match(/^(\d+)\s+(.+)$/);
  const commander = commanderMatch ? commanderMatch[2] : commanderLine;
  
  const cards = [];
  let totalCards = 0;
  
  // Parse remaining lines as cards
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Format: "1 Card Name" or "Card Name"
    const match = line.match(/^(\d+)\s+(.+)$/);
    const qty = match ? parseInt(match[1]) : 1;
    const cardName = match ? match[2] : line;
    
    if (cardName.toLowerCase() !== commander.toLowerCase()) {
      cards.push({ name: cardName, qty });
      totalCards += qty;
    }
  }
  
  // Add commander to count
  totalCards += 1;
  
  return { commander, cards, totalCards };
}

// Build deck text from cards
function buildDeckText(commander, cards) {
  let text = `${commander}\n`;
  for (const card of cards) {
    text += `${card.qty} ${card.name}\n`;
  }
  return text;
}

// Extract colors from commander name (simple heuristic - can be improved)
function extractColors(commander) {
  // This is a placeholder - you might want to look up actual colors
  // For now, return empty array and let the system figure it out
  return [];
}

async function importDecksFromCSV(csvFilePath) {
  console.log('🚀 Starting CSV import...\n');
  
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    process.exit(1);
  }
  
  console.log(`✓ Loading CSV file: ${csvFilePath}\n`);
  const csvContent = fs.readFileSync(csvFilePath, 'utf8');
  const { headers, decks } = parseCSV(csvContent);
  
  console.log(`📦 Found ${decks.length} decks in CSV`);
  console.log(`Headers: ${headers.join(', ')}\n`);
  
  const userId = '990d69b2-3500-4833-81df-b05e07f929db';
  let totalDecks = 0;
  let skipped = 0;
  
  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i];
    
    try {
      // Determine decklist source - could be in different columns
      let decklistText = '';
      let commander = '';
      let title = '';
      
      // Try different possible column names
      if (deck.decklist) decklistText = deck.decklist;
      else if (deck.deck_text) decklistText = deck.deck_text;
      else if (deck.cards) decklistText = deck.cards;
      else if (deck.list) decklistText = deck.list;
      
      // If decklist is in a single column, try to parse it
      if (!decklistText && deck.deck) {
        decklistText = deck.deck;
      }
      
      // If decklist spans multiple columns, try to combine them
      if (!decklistText) {
        // Look for columns that might contain card data
        const possibleCardColumns = headers.filter(h => 
          !['title', 'commander', 'name', 'format'].includes(h)
        );
        if (possibleCardColumns.length > 0) {
          decklistText = possibleCardColumns.map(col => deck[col]).filter(v => v).join('\n');
        }
      }
      
      commander = deck.commander || '';
      title = deck.title || deck.name || `${commander} - Imported Deck`;
      
      // If we have decklist text, parse it
      let parsed;
      if (decklistText) {
        parsed = parseDecklist(decklistText);
        if (parsed.commander && !commander) {
          commander = parsed.commander;
        }
      } else {
        // No decklist text - might be line-by-line format
        // Try to parse each non-header column as a card
        const cards = [];
        for (const [key, value] of Object.entries(deck)) {
          if (key !== 'title' && key !== 'commander' && key !== 'name' && value) {
            const match = value.match(/^(\d+)\s+(.+)$/);
            const qty = match ? parseInt(match[1]) : 1;
            const cardName = match ? match[2] : value;
            if (cardName.toLowerCase() !== commander.toLowerCase()) {
              cards.push({ name: cardName, qty });
            }
          }
        }
        parsed = { commander, cards, totalCards: cards.reduce((sum, c) => sum + c.qty, 0) + 1 };
      }
      
      if (!parsed.commander) {
        console.log(`  ⊘ Row ${i + 2}: No commander found, skipping`);
        skipped++;
        continue;
      }
      
      if (parsed.totalCards !== 100) {
        console.log(`  ⊘ Row ${i + 2}: ${title || parsed.commander} - Has ${parsed.totalCards} cards (expected 100), skipping`);
        skipped++;
        continue;
      }
      
      // Check if deck already exists
      const { data: existing } = await supabase
        .from('decks')
        .select('id')
        .eq('title', title)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (existing) {
        console.log(`  ⊘ Row ${i + 2}: Already exists - ${title}`);
        skipped++;
        continue;
      }
      
      // Build deck text
      const deckText = buildDeckText(parsed.commander, parsed.cards);
      const colors = extractColors(parsed.commander);
      
      // Insert deck
      const { data: newDeck, error: deckError } = await supabase
        .from('decks')
        .insert({
          user_id: userId,
          title: title,
          format: 'Commander',
          plan: 'Optimized',
          colors: colors,
          currency: 'USD',
          deck_text: deckText,
          commander: parsed.commander,
          is_public: true,
          public: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (deckError) {
        console.error(`  ✗ Row ${i + 2}: Error creating deck - ${deckError.message}`);
        skipped++;
        continue;
      }
      
      // Insert cards
      for (const card of parsed.cards) {
        await supabase
          .from('deck_cards')
          .insert({
            deck_id: newDeck.id,
            name: card.name,
            qty: card.qty,
          })
          .catch(() => {});
      }
      
      // Insert commander
      await supabase
        .from('deck_cards')
        .insert({
          deck_id: newDeck.id,
          name: parsed.commander,
          qty: 1,
        })
        .catch(() => {});
      
      totalDecks++;
      console.log(`  ✓ Row ${i + 2}: Created "${title}" (${parsed.commander}) - 100 cards`);
    } catch (error) {
      console.error(`  ✗ Row ${i + 2}: Error - ${error.message}`);
      skipped++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 IMPORT REPORT');
  console.log('='.repeat(60));
  console.log(`\n✅ Successfully imported: ${totalDecks} decks`);
  console.log(`⊘ Skipped: ${skipped} decks`);
  console.log(`\n✅ Done!`);
}

// Get CSV file path from command line or use default
const csvFile = process.argv[2] || path.join(__dirname, 'decks.csv');

if (import.meta.url === `file://${process.argv[1]}`) {
  importDecksFromCSV(csvFile).catch(console.error);
}

export { importDecksFromCSV };
