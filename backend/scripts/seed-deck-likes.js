// backend/scripts/seed-deck-likes.js
// Script to seed fake likes on public decks without creating fake accounts
// Usage: node scripts/seed-deck-likes.js [options]

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');
const frontendDir = resolve(projectRoot, 'frontend');

// Load environment variables - try multiple locations
const envPaths = [
  resolve(frontendDir, '.env.local'),
  resolve(projectRoot, '.env.local'),
  resolve(__dirname, '.env.local'),
  resolve(process.cwd(), '.env.local')
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✓ Loaded environment from: ${envPath}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.error('❌ Could not find .env.local file in any of these locations:');
  envPaths.forEach(p => console.error(`   - ${p}`));
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Get existing user IDs from the database
async function getExistingUserIds(limit = 100) {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id')
    .limit(limit);

  if (error) {
    console.error('⚠ Error fetching users:', error.message);
    return [];
  }

  return users?.map(u => u.id) || [];
}

// Generate a fake IP hash (simple hash for seeding)
function generateFakeIpHash() {
  return `seed_${Math.random().toString(36).substring(2, 15)}`;
}

// Get command line arguments
const args = process.argv.slice(2);
const minLikes = parseInt(args.find(a => a.startsWith('--min='))?.split('=')[1] || '0');
const maxLikes = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '10');
const targetDecks = args.find(a => a.startsWith('--decks='))?.split('=')[1];
const dryRun = args.includes('--dry-run');

console.log('\n🎲 Seeding Deck Likes\n');
console.log(`Configuration:`);
console.log(`  Min likes per deck: ${minLikes}`);
console.log(`  Max likes per deck: ${maxLikes}`);
console.log(`  Target decks: ${targetDecks || 'all public decks'}`);
console.log(`  Dry run: ${dryRun ? 'YES (no changes will be made)' : 'NO (will insert likes)'}`);
console.log('');

async function seedLikes() {
  try {
    // Get existing user IDs from the database
    const userIds = await getExistingUserIds(100);
    
    if (userIds.length === 0) {
      console.error('❌ No users found in database. Cannot seed likes without valid user IDs.');
      console.error('   The deck_likes table requires valid user_id foreign keys.');
      console.error('   Please create at least one user account first, then run this script again.');
      process.exit(1);
    }
    
    console.log(`📋 Using ${userIds.length} existing user ID(s) for seeding likes\n`);

    // Fetch all public decks
    let query = supabase
      .from('decks')
      .select('id, title, commander, created_at, updated_at')
      .or('is_public.eq.true,public.eq.true')
      .order('updated_at', { ascending: false });

    if (targetDecks) {
      // If specific deck IDs provided, filter to those
      const deckIds = targetDecks.split(',').map(id => id.trim());
      query = query.in('id', deckIds);
    }

    const { data: decks, error: decksError } = await query;

    if (decksError) {
      throw new Error(`Failed to fetch decks: ${decksError.message}`);
    }

    if (!decks || decks.length === 0) {
      console.log('⚠ No public decks found');
      return;
    }

    console.log(`📊 Found ${decks.length} public deck(s)\n`);

    // Check existing likes to avoid duplicates
    const { data: existingLikes } = await supabase
      .from('deck_likes')
      .select('deck_id, user_id');

    const existingLikesMap = new Map();
    if (existingLikes) {
      for (const like of existingLikes) {
        const key = `${like.deck_id}_${like.user_id}`;
        existingLikesMap.set(key, true);
      }
    }

    console.log(`📈 Existing likes in database: ${existingLikesMap.size}\n`);

    let totalLikesAdded = 0;
    const results = [];

    for (const deck of decks) {
      // Determine number of likes for this deck (weighted by recency)
      const daysSinceUpdate = (Date.now() - new Date(deck.updated_at || deck.created_at).getTime()) / (1000 * 60 * 60 * 24);
      
      // Newer decks get more likes (exponential decay)
      const recencyWeight = Math.max(0.1, Math.exp(-daysSinceUpdate / 30)); // 30-day half-life
      const baseLikes = Math.floor(minLikes + (maxLikes - minLikes) * recencyWeight);
      const numLikes = Math.floor(baseLikes + (Math.random() * (maxLikes - baseLikes + 1)));

      const likesToAdd = [];
      let added = 0;

      // Generate unique likes for this deck
      // Use random existing user IDs (can reuse same user for different decks)
      for (let i = 0; i < numLikes; i++) {
        // Pick a random user ID from existing users
        const userId = userIds[Math.floor(Math.random() * userIds.length)];
        const key = `${deck.id}_${userId}`;

        // Skip if this exact like already exists (same deck + same user)
        if (existingLikesMap.has(key)) {
          continue;
        }

        likesToAdd.push({
          deck_id: deck.id,
          user_id: userId,
          ip_hash: generateFakeIpHash(),
          created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // Random time in last 30 days
        });

        existingLikesMap.set(key, true);
        added++;
      }

      if (likesToAdd.length > 0) {
        if (!dryRun) {
          const { error: insertError } = await supabase
            .from('deck_likes')
            .insert(likesToAdd);

          if (insertError) {
            console.error(`  ✗ Failed to add likes to "${deck.title || deck.commander || deck.id}": ${insertError.message}`);
            results.push({ deck: deck.title || deck.commander || deck.id, success: false, error: insertError.message });
            continue;
          }
        }

        totalLikesAdded += likesToAdd.length;
        results.push({
          deck: deck.title || deck.commander || deck.id,
          success: true,
          likesAdded: likesToAdd.length,
        });

        console.log(`  ✓ ${deck.title || deck.commander || deck.id}: +${likesToAdd.length} likes${dryRun ? ' (dry run)' : ''}`);
      } else {
        console.log(`  ⊘ ${deck.title || deck.commander || deck.id}: Already has likes, skipping`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  Total decks processed: ${decks.length}`);
    console.log(`  Likes added: ${totalLikesAdded}${dryRun ? ' (dry run - not actually added)' : ''}`);
    console.log(`  Successful: ${results.filter(r => r.success).length}`);
    console.log(`  Failed: ${results.filter(r => !r.success).length}`);

    if (!dryRun && totalLikesAdded > 0) {
      console.log('\n✅ Likes seeded successfully!');
    } else if (dryRun) {
      console.log('\n💡 Run without --dry-run to actually insert the likes');
    }

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedLikes();
