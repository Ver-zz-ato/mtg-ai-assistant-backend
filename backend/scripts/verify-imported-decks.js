// backend/scripts/verify-imported-decks.js
// Verifies that decks were imported successfully

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

async function verifyImportedDecks() {
  console.log('🔍 Verifying imported decks...\n');
  
  const userId = '990d69b2-3500-4833-81df-b05e07f929db';
  
  // Get all public decks for this user
  const { data: decks, error: decksError } = await supabase
    .from('decks')
    .select('id, title, commander, format, is_public, public, created_at')
    .eq('user_id', userId)
    .eq('format', 'Commander')
    .order('created_at', { ascending: false });
  
  if (decksError) {
    console.error(`❌ Error fetching decks: ${decksError.message}`);
    process.exit(1);
  }
  
  console.log(`📊 Found ${decks?.length || 0} Commander decks\n`);
  
  if (!decks || decks.length === 0) {
    console.log('⚠️  No decks found. They may not have been imported yet.');
    console.log('\nTo import decks, run:');
    console.log('  node scripts/import-decks-from-csv.js scripts/commander_50_real_decks.csv');
    return;
  }
  
  // Get card counts for each deck
  console.log('Checking card counts...\n');
  let validDecks = 0;
  let invalidDecks = 0;
  
  for (const deck of decks.slice(0, 10)) {
    const { data: cards, error: cardsError } = await supabase
      .from('deck_cards')
      .select('name, qty')
      .eq('deck_id', deck.id);
    
    if (cardsError) {
      console.log(`  ⚠ ${deck.title}: Error fetching cards - ${cardsError.message}`);
      continue;
    }
    
    const totalCards = (cards || []).reduce((sum, c) => sum + (c.qty || 1), 0);
    const isPublic = deck.is_public || deck.public;
    const status = totalCards === 100 ? '✓' : '✗';
    
    if (totalCards === 100) {
      validDecks++;
    } else {
      invalidDecks++;
    }
    
    console.log(`  ${status} ${deck.title}`);
    console.log(`     Commander: ${deck.commander || 'N/A'}`);
    console.log(`     Cards: ${totalCards}/100`);
    console.log(`     Public: ${isPublic ? 'Yes' : 'No'}`);
    console.log(`     ID: ${deck.id}`);
    console.log('');
  }
  
  if (decks.length > 10) {
    console.log(`... and ${decks.length - 10} more decks\n`);
  }
  
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total decks: ${decks.length}`);
  console.log(`Valid (100 cards): ${validDecks}`);
  console.log(`Invalid: ${invalidDecks}`);
  
  // Check if they're accessible via browse API
  console.log(`\n🌐 Public decks accessible: ${decks.filter(d => d.is_public || d.public).length}`);
  console.log(`\n✅ Verification complete!`);
  console.log(`\nYou can view these decks at:`);
  console.log(`  - Browse: /decks/browse`);
  console.log(`  - Individual: /decks/{deck-id}`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule) {
  verifyImportedDecks().catch(error => {
    console.error('Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  });
}

export { verifyImportedDecks };
