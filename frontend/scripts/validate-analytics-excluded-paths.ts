/**
 * Validates that excluded paths and bot UAs do not trigger user_first_visit.
 * Run: npx tsx scripts/validate-analytics-excluded-paths.ts
 */

import {
  isExcludedPath,
  isBot,
  isRealHtmlNavigation,
} from '../lib/analytics/middleware-helpers';

const EXCLUDED_PATHS = [
  '/manifest.json',
  '/robots.txt',
  '/favicon.ico',
  '/index.html',
  '/icons/foo',
  '/_next/static/abc',
  '/assets/foo',
  '/sitemap.xml',
  '/sitemap-foo.xml',
];

const BOT_UAS = [
  'Googlebot/2.1',
  'Mozilla/5.0 (compatible; Bingbot/2.0)',
  'DuckDuckBot/1.0',
  'facebookexternalhit/1.1',
  'Twitterbot/1.0',
  'HeadlessChrome/1.0',
  'Lighthouse',
];

function run() {
  let ok = true;

  console.log('Validate excluded paths (isExcludedPath === true):');
  for (const p of EXCLUDED_PATHS) {
    const ex = isExcludedPath(p);
    if (!ex) {
      console.log(`  FAIL ${p} -> ${ex}`);
      ok = false;
    } else {
      console.log(`  OK   ${p}`);
    }
  }

  console.log('\nValidate bot UAs (isBot === true):');
  for (const ua of BOT_UAS) {
    const bot = isBot(ua);
    if (!bot) {
      console.log(`  FAIL ${ua.slice(0, 40)}... -> ${bot}`);
      ok = false;
    } else {
      console.log(`  OK   ${ua.slice(0, 40)}...`);
    }
  }

  console.log('\nValidate non-HTML requests (isRealHtmlNavigation === false):');
  const nonHtml = [
    { method: 'POST', accept: 'application/json', dest: null },
    { method: 'GET', accept: 'application/json', dest: null },
    { method: 'GET', accept: '*/*', dest: null },
  ];
  for (const r of nonHtml) {
    const html = isRealHtmlNavigation(r.method, r.accept, r.dest);
    if (html) {
      console.log(`  FAIL method=${r.method} accept=${r.accept} -> ${html}`);
      ok = false;
    } else {
      console.log(`  OK   method=${r.method} accept=${r.accept}`);
    }
  }

  console.log('\nValidate HTML navigation (isRealHtmlNavigation === true):');
  const htmlNav = [
    { method: 'GET', accept: 'text/html,application/xhtml+xml', dest: null },
    { method: 'GET', accept: '*/*', dest: 'document' },
  ];
  for (const r of htmlNav) {
    const html = isRealHtmlNavigation(r.method, r.accept, r.dest);
    if (!html) {
      console.log(`  FAIL method=${r.method} accept=${r.accept} dest=${r.dest} -> ${html}`);
      ok = false;
    } else {
      console.log(`  OK   method=${r.method} accept=${r.accept} dest=${r.dest}`);
    }
  }

  if (ok) {
    console.log('\nAll checks passed. Excluded paths and bot UAs will not fire user_first_visit.');
  } else {
    console.log('\nSome checks failed.');
    process.exit(1);
  }
}

run();
