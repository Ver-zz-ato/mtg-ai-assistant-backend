#!/usr/bin/env node
/**
 * Convert PDF test format to database format and import via API
 * 
 * Usage: node import-tests.js
 */

const fs = require('fs');
const path = require('path');

// Read the test cases JSON
const testCasesFile = path.join(__dirname, 'test-cases.json');
const testCases = JSON.parse(fs.readFileSync(testCasesFile, 'utf-8'));

// Convert PDF format to database format
const dbTestCases = testCases.testCases.map((tc) => {
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
    tags.push(`focus:${tc.focus.substring(0, 100)}`); // Limit focus tag length
  }
  
  return {
    name: tc.title,
    type,
    input,
    expectedChecks: expectedChecks,
    tags,
    source: "pdf_import_2025",
  };
});

// Write converted format to a file for manual review/import
const outputFile = path.join(__dirname, 'test-cases-converted.json');
fs.writeFileSync(outputFile, JSON.stringify({ testCases: dbTestCases }, null, 2));

console.log(`✅ Converted ${dbTestCases.length} test cases`);
console.log(`📄 Saved converted format to: ${outputFile}`);
console.log(`\nNext step: POST to /api/admin/ai-test/import`);
console.log(`\nOr run this script from the API directory to import automatically.`);

// Export for use in other scripts
if (require.main === module) {
  // If run directly, just convert
  process.exit(0);
}

module.exports = { dbTestCases };
