#!/usr/bin/env node
/**
 * Check what tests are actually in the database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const projectRoot = path.resolve(__dirname, '../..');
const envPaths = [
  path.join(projectRoot, '.env.local'),
  path.join(__dirname, '../.env.local'),
  '.env.local'
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Checking test cases in database...\n');

// Get total count
const { count: totalCount } = await supabase
  .from('ai_test_cases')
  .select('*', { count: 'exact', head: true });

console.log(`Total tests in database: ${totalCount || 0}\n`);

// Get breakdown by source
const { data: allTests, error } = await supabase
  .from('ai_test_cases')
  .select('id, name, source, created_at')
  .order('created_at', { ascending: false });

if (error) {
  console.error('Error fetching tests:', error.message);
  process.exit(1);
}

// Group by source
const bySource = {};
for (const test of allTests || []) {
  const source = test.source || '(null)';
  if (!bySource[source]) {
    bySource[source] = [];
  }
  bySource[source].push(test);
}

console.log('Breakdown by source:');
for (const [source, tests] of Object.entries(bySource)) {
  console.log(`  ${source}: ${tests.length} tests`);
}

console.log('\nRecent tests (last 10):');
for (const test of (allTests || []).slice(0, 10)) {
  console.log(`  - ${test.name} (source: ${test.source || '(null)'}, created: ${test.created_at})`);
}
