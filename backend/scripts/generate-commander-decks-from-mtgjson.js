// backend/scripts/generate-commander-decks-from-mtgjson.js
// Downloads Commander decks from MTGJSON and exports to CSV format

import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DECK_LIST_URL = 'https://mtgjson.com/api/v5/DeckList.json.gz';
const DECK_BASE_URL = 'https://mtgjson.com/api/v5/decks/';
const OUTPUT_FILE = path.join(__dirname, 'commander_50_real_decks.csv');
const MAX_DECKS = 50;

// Download and decompress a .gz JSON file
async function downloadGzJson(url) {
  console.log(`  Downloading: ${url}`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  // Get the response as a buffer
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Decompress using zlib
  const zlib = await import('zlib');
  const { promisify } = await import('util');
  const gunzip = promisify(zlib.gunzip);
  
  const decompressed = await gunzip(buffer);
  const jsonText = decompressed.toString('utf8');
  
  return JSON.parse(jsonText);
}

// Validate a deck
function validateDeck(deckData) {
  const issues = [];
  
  // Check commander
  if (!deckData.commander || !Array.isArray(deckData.commander) || deckData.commander.length === 0) {
    issues.push('missing commander');
    return { valid: false, issues };
  }
  
  if (deckData.commander.length !== 1) {
    issues.push(`partner commanders (${deckData.commander.length} commanders)`);
    return { valid: false, issues };
  }
  
  // Check mainboard
  if (!deckData.mainBoard || !Array.isArray(deckData.mainBoard)) {
    issues.push('missing mainboard');
    return { valid: false, issues };
  }
  
  // Count cards
  let commanderCount = 0;
  for (const card of deckData.commander) {
    commanderCount += card.count || 1;
  }
  
  let mainboardCount = 0;
  for (const card of deckData.mainBoard) {
    mainboardCount += card.count || 1;
  }
  
  const totalCards = commanderCount + mainboardCount;
  
  if (totalCards !== 100) {
    issues.push(`card count != 100 (found ${totalCards})`);
    return { valid: false, issues };
  }
  
  return { valid: true, issues: [] };
}

// Format decklist text
function formatDecklist(commander, mainBoard) {
  let text = `${commander.name}\n`;
  
  for (const card of mainBoard) {
    const count = card.count || 1;
    text += `${count} ${card.name}\n`;
  }
  
  return text;
}

// Escape CSV field (handle quotes and newlines)
function escapeCsvField(field) {
  if (field.includes('"') || field.includes('\n') || field.includes(',')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

async function generateCommanderDecksCSV() {
  console.log('📦 Starting MTGJSON Commander deck export...\n');
  
  // Step 1: Download DeckList
  console.log('Step 1: Downloading deck list...');
  let deckList;
  try {
    deckList = await downloadGzJson(DECK_LIST_URL);
  } catch (error) {
    console.error(`❌ Failed to download deck list: ${error.message}`);
    process.exit(1);
  }
  
  // MTGJSON v5 structure: { data: { ... } } or direct array
  const deckListData = deckList.data || deckList;
  const deckEntries = Array.isArray(deckListData) ? deckListData : Object.values(deckListData);
  
  console.log(`✓ Downloaded deck list (${deckEntries.length} entries)\n`);
  
  // Step 2: Filter to Commander decks
  console.log('Step 2: Filtering Commander decks...');
  const allDecks = deckEntries;
  const commanderDecks = allDecks.filter(deck => 
    deck.type === 'Commander Deck' || 
    deck.type === 'Commander' ||
    (deck.type && deck.type.toLowerCase().includes('commander'))
  );
  
  console.log(`✓ Found ${commanderDecks.length} Commander decks\n`);
  
  // Step 3: Sort by release date (newest first)
  commanderDecks.sort((a, b) => {
    const dateA = new Date(a.releaseDate || '1970-01-01');
    const dateB = new Date(b.releaseDate || '1970-01-01');
    return dateB - dateA;
  });
  
  // Step 4: Process decks until we have 50 valid ones
  console.log('Step 3: Processing decks...\n');
  
  const validDecks = [];
  const skippedDecks = [];
  let processed = 0;
  
  // Open CSV file for writing
  const csvStream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
  
  // Write header
  csvStream.write('title,commander,decklist\n');
  
  for (const deckEntry of commanderDecks) {
    if (validDecks.length >= MAX_DECKS) {
      break;
    }
    
    processed++;
    const deckName = deckEntry.name || 'Unknown Deck';
    const fileName = deckEntry.fileName;
    
    if (!fileName) {
      skippedDecks.push({ name: deckName, reason: 'missing fileName' });
      continue;
    }
    
    try {
      console.log(`[${processed}] Processing: ${deckName} (${fileName})`);
      
      // Download deck data
      const deckUrl = `${DECK_BASE_URL}${fileName}.json.gz`;
      let deckData;
      
      try {
        deckData = await downloadGzJson(deckUrl);
      } catch (error) {
        skippedDecks.push({ name: deckName, reason: `download failed: ${error.message}` });
        console.log(`  ⊘ Skipped: download failed`);
        continue;
      }
      
      // Handle MTGJSON structure
      const deckDataObj = deckData.data || deckData;
      
      // Validate deck
      const validation = validateDeck(deckDataObj);
      
      if (!validation.valid) {
        skippedDecks.push({ 
          name: deckName, 
          reason: validation.issues.join(', ') 
        });
        console.log(`  ⊘ Skipped: ${validation.issues.join(', ')}`);
        continue;
      }
      
      // Extract deck info
      const commander = deckDataObj.commander[0];
      const mainBoard = deckDataObj.mainBoard || [];
      const deckTitle = deckDataObj.name || deckData.name || deckName;
      const setCode = deckDataObj.code || deckData.code || '';
      
      // Format decklist
      const decklist = formatDecklist(commander, mainBoard);
      
      // Write to CSV
      const title = setCode ? `${deckTitle} (${setCode})` : deckTitle;
      const commanderName = commander.name;
      
      const totalCards = (commander.count || 1) + mainBoard.reduce((sum, c) => sum + (c.count || 1), 0);
      
      csvStream.write(
        `${escapeCsvField(title)},${escapeCsvField(commanderName)},${escapeCsvField(decklist)}\n`
      );
      
      validDecks.push({
        name: deckTitle,
        commander: commanderName,
        cards: totalCards
      });
      
      console.log(`  ✓ Added: ${deckTitle} (${commanderName}) - ${totalCards} cards`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      skippedDecks.push({ name: deckName, reason: `error: ${error.message}` });
      console.log(`  ✗ Error: ${error.message}`);
    }
  }
  
  csvStream.end();
  
  // Wait for file to finish writing
  await new Promise(resolve => {
    csvStream.on('finish', resolve);
  });
  
  // Step 5: Report
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 EXPORT REPORT');
  console.log('='.repeat(60));
  console.log(`\n✅ Successfully exported: ${validDecks.length} decks`);
  console.log(`📁 Output file: ${OUTPUT_FILE}`);
  
  if (skippedDecks.length > 0) {
    console.log(`\n⚠️  Skipped ${skippedDecks.length} decks:`);
    skippedDecks.slice(0, 20).forEach((deck, i) => {
      console.log(`  ${i + 1}. ${deck.name}: ${deck.reason}`);
    });
    if (skippedDecks.length > 20) {
      console.log(`  ... and ${skippedDecks.length - 20} more`);
    }
  }
  
  console.log(`\n✅ Done! CSV file created at: ${OUTPUT_FILE}`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  console.log('Starting script...');
  generateCommanderDecksCSV().catch(error => {
    console.error('Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  });
}

export { generateCommanderDecksCSV };
