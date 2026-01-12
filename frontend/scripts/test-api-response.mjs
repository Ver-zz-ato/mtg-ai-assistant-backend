#!/usr/bin/env node
/**
 * Check what the API actually returns
 * This simulates what the frontend sees
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

console.log('Checking what the API route logic would return...\n');

// Simulate what the API route does (from cases/route.ts lines 29-56)
// 1. Load from JSON file
const jsonPath = path.join(__dirname, '../lib/data/ai_test_cases.json');
let jsonCases = [];
try {
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  jsonCases = jsonData.testCases || [];
  console.log(`JSON file tests: ${jsonCases.length}`);
} catch (e) {
  console.log(`JSON file tests: 0 (error: ${e.message})`);
}

// 2. Load from database
const { data: dbCases, error } = await supabase
  .from('ai_test_cases')
  .select('*')
  .order('created_at', { ascending: false });

if (error) {
  console.warn('Failed to load DB test cases:', error.message);
}

console.log(`Database tests: ${dbCases?.length || 0}`);

// 3. Combine (what the API does)
const allCases = [
  ...jsonCases.map((tc) => ({
    ...tc,
    source: tc.source || 'curated',
  })),
  ...(dbCases || []).map((tc) => ({
    id: tc.id,
    name: tc.name,
    type: tc.type,
    input: tc.input,
    expectedChecks: tc.expected_checks,
    tags: tc.tags || [],
    source: tc.source || 'user_submitted',
    createdAt: tc.created_at,
  })),
];

console.log(`\nTotal tests (JSON + Database): ${allCases.length}`);
console.log(`\nBreakdown:`);
console.log(`  From JSON: ${jsonCases.length}`);
console.log(`  From Database: ${dbCases?.length || 0}`);

if (allCases.length > 0) {
  console.log(`\nFirst 5 tests:`);
  allCases.slice(0, 5).forEach((tc, i) => {
    console.log(`  ${i + 1}. ${tc.name || tc.id} (source: ${tc.source || 'unknown'})`);
  });
}
