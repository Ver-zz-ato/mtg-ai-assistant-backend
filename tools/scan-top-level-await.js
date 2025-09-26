#!/usr/bin/env node

/**
 * Lightweight scanner for suspicious top-level `await` in TS/TSX/JS/JSX files.
 * It does NOT modify files. It prints candidate lines with a small context.
 *
 * Heuristic:
 *  - We search for "await " tokens.
 *  - We try to detect whether we're inside an `async` function by scanning
 *    up to N lines above for `async function` or `async (` or `=>` with async.
 *  - We also try to skip obvious `useEffect(async () => { ... })` cases.
 *  - This is not a full parser; it is a fast, approximate helper.
 */

const fs = require('fs');
const path = require('path');

const ROOTS = [
  'frontend/components',
  'frontend/app',
  'frontend/pages',
  'frontend/lib',
  'components',
  'app',
  'pages',
  'lib',
];

const exts = new Set(['.tsx', '.ts', '.jsx', '.js']);
const MAX_LOOKBACK = 6;

function listFiles(dir) {
  const out = [];
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...listFiles(p));
      else if (exts.has(path.extname(ent.name))) out.push(p);
    }
  } catch {}
  return out;
}

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  let hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('await ')) {
      // Try to decide if this is *likely* top-level
      // Lookback a few lines for "async" clues
      let asyncNearby = false;
      for (let k = Math.max(0, i - MAX_LOOKBACK); k < i; k++) {
        const l = lines[k];
        if (/\basync\b\s*(function|\(|\w*\s*\()/.test(l)) { asyncNearby = true; break; }
        if (/useEffect\s*\(\s*async\s*\(\s*\)\s*=>/.test(l)) { asyncNearby = true; break; }
      }
      if (!asyncNearby) {
        hits.append({"line": i+1, "text": line.trim()});
      }
    }
  }
  if (hits.length) {
    console.log(JSON.stringify({
      tag: "scan_top_level_await",
      file,
      hits
    }));
  }
}

function main() {
  let files = [];
  for (const r of ROOTS) {
    if (fs.existsSync(r)) files.push(...listFiles(r));
  }
  if (files.length === 0) {
    console.log(JSON.stringify({ tag: "scan_top_level_await", info: "no_roots_found", roots: ROOTS }));
    process.exit(0);
  }
  for (const f of files) scanFile(f);
}

main();