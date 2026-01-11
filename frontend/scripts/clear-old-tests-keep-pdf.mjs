#!/usr/bin/env node
/**
 * Clear old test cases but keep the PDF-imported ones (source = 'pdf_import_2025')
 * Also deletes associated test results
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

console.log('Finding old test cases to delete...');

// First, get IDs of test cases that are NOT from pdf_import_2025
const { data: oldTests, error: selectError } = await supabase
  .from('ai_test_cases')
  .select('id')
  .neq('source', 'pdf_import_2025');

if (selectError) {
  console.error('Error finding old tests:', selectError.message);
  process.exit(1);
}

const oldTestIds = (oldTests || []).map(t => t.id);
console.log(`Found ${oldTestIds.length} old test cases to delete`);

if (oldTestIds.length === 0) {
  console.log('No old tests to delete');
  process.exit(0);
}

// Delete associated test results first (foreign key constraint)
console.log('Deleting associated test results...');
const { error: resultsError } = await supabase
  .from('ai_test_results')
  .delete()
  .in('test_case_id', oldTestIds);

if (resultsError) {
  console.error('Error deleting test results:', resultsError.message);
  // Continue anyway - maybe there are no results
  console.log('Continuing... (may not have test results)');
}

// Now delete the old test cases
console.log('Deleting old test cases...');
const { error: deleteError, data } = await supabase
  .from('ai_test_cases')
  .delete()
  .in('id', oldTestIds)
  .select();

if (deleteError) {
  console.error('Error deleting tests:', deleteError.message);
  process.exit(1);
}

console.log(`Deleted ${data?.length || 0} old test cases`);
console.log('Kept PDF-imported tests (source: pdf_import_2025)');

// Check how many remain
const { count } = await supabase
  .from('ai_test_cases')
  .select('*', { count: 'exact', head: true })
  .eq('source', 'pdf_import_2025');

console.log(`Remaining PDF-imported tests: ${count || 0}`);
