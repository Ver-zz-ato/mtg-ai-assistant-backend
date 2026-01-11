#!/usr/bin/env node
/**
 * Directly import test cases into the database
 * Uses environment variables for Supabase connection
 * 
 * Usage: node import-tests-direct.js
 */

const fs = require('fs');
const path = require('path');

// Read the test cases JSON
const testCasesFile = path.join(__dirname, 'test-cases.json');
const testCasesData = JSON.parse(fs.readFileSync(testCasesFile, 'utf-8'));
const pdfTestCases = testCasesData.testCases;

console.log(`Reading ${pdfTestCases.length} test cases from ${testCasesFile}...`);

// Convert PDF format to database format (same logic as import-pdf route)
const dbTestCases = pdfTestCases.map((tc) => {
  // Determine type based on whether decklist is present
  const type = tc.decklist && tc.decklist.trim() ? "deck_analysis" : "chat";
  
  // Build input object
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
  
  // Build expected_checks from must_assert
  const expectedChecks = {};
  
  for (const assertion of tc.must_assert || []) {
    if (assertion.includes("must mention")) {
      const match = assertion.match(/must mention (.+)/i);
      if (match) {
        if (!expectedChecks.shouldContain) expectedChecks.shouldContain = [];
        expectedChecks.shouldContain.push(match[1]);
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
  
  // Add focus to tags if present
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

console.log(`Converted ${dbTestCases.length} test cases to database format`);
console.log(`\nTo import these, you need to POST to /api/admin/ai-test/import-pdf`);
console.log(`\nBut the route requires >=200 tests. Options:`);
console.log(`1. Temporarily remove the 200 test requirement from import-pdf route`);
console.log(`2. Use /api/admin/ai-test/import (regular import route) with converted format`);
console.log(`3. Write a migration script that inserts directly`);
console.log(`\nThe converted format is ready. Which approach would you prefer?`);

// Save converted format for reference
const convertedFile = path.join(__dirname, 'test-cases-db-format.json');
fs.writeFileSync(convertedFile, JSON.stringify({ testCases: dbTestCases }, null, 2));
console.log(`\nSaved converted format to: ${convertedFile}`);
