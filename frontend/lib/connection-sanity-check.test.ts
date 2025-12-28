/**
 * Unit tests for connection-sanity-check.ts
 * 
 * These tests can be run manually in browser console or with a test framework.
 * 
 * To run manually in browser console:
 * 1. Import the functions
 * 2. Test each case below
 */

// Manual test cases (can be run in browser console):
// 
// import { sanitizeUrl, checkProtocolMismatch } from '@/lib/connection-sanity-check';
//
// // Test sanitizeUrl
// sanitizeUrl('https://example.com/path?query=value&other=123');
// // Expected: 'https://example.com/path'
//
// sanitizeUrl('https://user:pass@example.com/path?query=value#hash');
// // Expected: 'https://example.com/path'
//
// // Test checkProtocolMismatch
// checkProtocolMismatch('http:', 'https:');  // Expected: true
// checkProtocolMismatch('https:', 'https:'); // Expected: false
// checkProtocolMismatch('http:', 'http:');   // Expected: false (local dev OK)

/**
 * Manual Test Cases
 * 
 * Run these in browser console on production site:
 */

// Test 1: URL Sanitization
// Expected: All should remove query/hash/auth
console.log('Test 1: URL Sanitization');
const testCases = [
  ['https://example.com/path?query=value', 'https://example.com/path'],
  ['https://example.com/path#hash', 'https://example.com/path'],
  ['https://user:pass@example.com/path?q=1#h', 'https://example.com/path'],
];

// Test 2: Protocol Mismatch Detection  
// Expected: http:// on https:// page = true (mismatch), others = false
console.log('Test 2: Protocol Mismatch');
const protocolTests = [
  ['http:', 'https:', true],   // Mismatch
  ['https:', 'https:', false], // OK
  ['http:', 'http:', false],   // OK (local dev)
  ['https:', 'http:', false],  // OK
];

// To run these tests, import the functions and test each case
// import { sanitizeUrl, checkProtocolMismatch } from '@/lib/connection-sanity-check';
