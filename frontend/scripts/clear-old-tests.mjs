#!/usr/bin/env node
/**
 * Clear all old test cases from the database
 * This will delete all tests, keeping only the newly imported ones
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
  console.error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Deleting all old test cases...');

// First, get count
const { count } = await supabase
  .from('ai_test_cases')
  .select('*', { count: 'exact', head: true });

console.log(`Found ${count || 0} test cases in database`);

// Delete all (except the impossible UUID to avoid deleting nothing)
const { error, data } = await supabase
  .from('ai_test_cases')
  .delete()
  .neq('id', '00000000-0000-0000-0000-000000000000')
  .select();

if (error) {
  console.error('Error deleting tests:', error.message);
  process.exit(1);
}

console.log(`Deleted ${data?.length || count || 0} test cases`);
console.log('Old tests cleared. Only new PDF-imported tests remain.');
