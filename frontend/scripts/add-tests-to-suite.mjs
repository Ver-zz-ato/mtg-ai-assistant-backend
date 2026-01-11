#!/usr/bin/env node
/**
 * Import test cases by calling the import-pdf API endpoint
 * This script reads test-cases.json and POSTs it to the API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read test cases
const testCasesFile = path.join(__dirname, 'test-cases.json');
const testCasesData = JSON.parse(fs.readFileSync(testCasesFile, 'utf-8'));

console.log(`📄 Read ${testCasesData.testCases.length} test cases`);
console.log(`\n⚠️  To import these tests, you need to:`);
console.log(`\n1. Make sure your dev server is running`);
console.log(`2. Be logged in as admin`);
console.log(`3. Run this command (replace COOKIE with your session cookie):\n`);

console.log(`curl -X POST http://localhost:3000/api/admin/ai-test/import-pdf \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -H "Cookie: YOUR_SESSION_COOKIE" \\`);
console.log(`  -d '${JSON.stringify({ testCases: testCasesData.testCases })}'\n`);

console.log(`Or use the browser console on the admin page:\n`);
console.log(`fetch('/api/admin/ai-test/import-pdf', {`);
console.log(`  method: 'POST',`);
console.log(`  headers: { 'Content-Type': 'application/json' },`);
console.log(`  body: JSON.stringify(${JSON.stringify({ testCases: testCasesData.testCases })})`);
console.log(`}).then(r => r.json()).then(console.log)\n`);
