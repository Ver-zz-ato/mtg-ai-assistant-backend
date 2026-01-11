#!/usr/bin/env node
/**
 * Import test cases via the import-pdf API endpoint
 * 
 * Usage: node import-via-api.js
 * 
 * This script reads test-cases.json and POSTs it to /api/admin/ai-test/import-pdf
 * You need to be logged in as admin for this to work.
 */

const fs = require('fs');
const path = require('path');

// Read the test cases JSON
const testCasesFile = path.join(__dirname, 'test-cases.json');
const testCases = JSON.parse(fs.readFileSync(testCasesFile, 'utf-8'));

console.log(`📄 Read ${testCases.testCases.length} test cases from ${testCasesFile}`);
console.log(`\n⚠️  To import these, you need to:`);
console.log(`1. Make sure you're logged in as admin`);
console.log(`2. POST to /api/admin/ai-test/import-pdf with this body:`);
console.log(`\n   ${JSON.stringify({ testCases: testCases.testCases }, null, 2).substring(0, 200)}...`);
console.log(`\nOr use curl (replace COOKIE with your auth cookie):`);
console.log(`\ncurl -X POST http://localhost:3000/api/admin/ai-test/import-pdf \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "Cookie: COOKIE" \\`);
console.log(`  -d @${testCasesFile}`);
console.log(`\n✅ The import-pdf route will convert the format and insert into the database.`);
