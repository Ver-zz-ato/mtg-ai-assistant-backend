// backend/scripts/test-browse-api.js
// Test the browse API to see what it returns

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const frontendDir = path.join(projectRoot, 'frontend');

const envPaths = [
  path.join(frontendDir, '.env.local'),
  path.join(projectRoot, '.env.local'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function testBrowseAPI() {
  console.log('Testing browse API...\n');
  
  try {
    const url = `${baseUrl}/api/decks/browse?page=1&limit=24`;
    console.log(`Fetching: ${url}\n`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ API Response:');
      console.log(`  Decks returned: ${data.decks?.length || 0}`);
      console.log(`  Total: ${data.total}`);
      console.log(`  Page: ${data.page}`);
      console.log(`  Limit: ${data.limit}`);
      console.log(`  Has More: ${data.hasMore}`);
      console.log(`\n  First few decks:`);
      data.decks?.slice(0, 5).forEach((deck, i) => {
        console.log(`    ${i + 1}. ${deck.title} (${deck.commander})`);
      });
    } else {
      console.error('❌ API Error:', data.error);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    console.log('\nMake sure your Next.js server is running on', baseUrl);
  }
}

testBrowseAPI();
