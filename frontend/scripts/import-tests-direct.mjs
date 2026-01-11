#!/usr/bin/env node
/**
 * Directly import test cases into the database using Supabase
 * This adds tests without deleting existing ones
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
  console.error('❌ Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Read test cases
const testCasesFile = path.join(__dirname, 'test-cases.json');
const testCasesData = JSON.parse(fs.readFileSync(testCasesFile, 'utf-8'));
const pdfTestCases = testCasesData.testCases;

console.log(`📄 Read ${pdfTestCases.length} test cases from ${testCasesFile}`);

// Convert PDF format to database format (same logic as import-pdf route)
const dbTestCases = pdfTestCases.map((tc) => {
  const type = tc.decklist && tc.decklist.trim() ? "deck_analysis" : "chat";
  
  const input = {
    userMessage: tc.user_prompt,
    format: tc.format === "commander" ? "Commander" : tc.format.charAt(0).toUpperCase() + tc.format.slice(1),
  };
  
  if (tc.commander) {
    input.commander = tc.commander;
  }
  
  if (tc.decklist && tc.decklist.trim()) {
    input.deckText = tc.decklist;
  }
  
  const expectedChecks = {};
  
  for (const assertion of tc.must_assert || []) {
    if (assertion.includes("must mention")) {
      const match = assertion.match(/must mention (.+)/i);
      if (match) {
        if (!expectedChecks.shouldContain) expectedChecks.shouldContain = [];
        expectedChecks.shouldContain.push(match[1].replace(/\)$/, '')); // Remove trailing )
      }
    } else if (assertion.includes("must not recommend") || assertion.includes("must not suggest")) {
      const match = assertion.match(/must not (?:recommend|suggest) (.+)/i);
      if (match) {
        if (!expectedChecks.shouldNotContain) expectedChecks.shouldNotContain = [];
        expectedChecks.shouldNotContain.push(match[1]);
      }
    } else if (assertion.includes("must flag")) {
      const match = assertion.match(/must flag (.+)/i);
      if (match) {
        if (!expectedChecks.shouldContain) expectedChecks.shouldContain = [];
        expectedChecks.shouldContain.push(match[1]);
      }
    } else if (assertion.includes(">=") || assertion.includes("≥")) {
      const match = assertion.match(/[>=≥]\s*(\d+)/);
      if (match) {
        expectedChecks.minCardSuggestions = parseInt(match[1], 10);
      }
    } else if (assertion.includes("must include")) {
      const match = assertion.match(/must include (.+)/i);
      if (match) {
        if (!expectedChecks.shouldContain) expectedChecks.shouldContain = [];
        expectedChecks.shouldContain.push(match[1]);
      }
    }
  }
  
  const tags = [...(tc.tags || [])];
  if (tc.focus) {
    tags.push(`focus:${tc.focus.substring(0, 100)}`);
  }
  
  return {
    name: tc.title,
    type,
    input,
    expected_checks: expectedChecks,
    tags,
    source: "pdf_import_2025",
  };
});

console.log(`🔄 Converted ${dbTestCases.length} test cases to database format`);

// Insert in batches
const batchSize = 100;
let inserted = 0;
let errors = 0;

console.log(`\n📤 Inserting test cases into database...`);

for (let i = 0; i < dbTestCases.length; i += batchSize) {
  const batch = dbTestCases.slice(i, i + batchSize);
  const { data, error } = await supabase
    .from("ai_test_cases")
    .insert(batch)
    .select();
  
  if (error) {
    console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
    errors += batch.length;
  } else {
    inserted += data?.length || 0;
    console.log(`✓ Batch ${Math.floor(i / batchSize) + 1}: Inserted ${data?.length || 0} test cases`);
  }
}

console.log(`\n✅ Successfully imported ${inserted} test cases`);
if (errors > 0) {
  console.log(`⚠️  ${errors} test cases failed to import`);
}
