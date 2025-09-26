// Simple scanner that flags top-level `await` in .ts/.tsx files.
//
// Usage:
//   node tools/scan-top-level-await.js
//
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INCLUDED = ['app', 'components', 'lib', 'pages', 'src'];

// Heuristic: a line has a top-level await if it includes 'await' and is not within import/export or async fn
function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath).replaceAll('\\','/');
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();

    // skip obvious cases
    if (!stripped.includes('await')) continue;
    if (stripped.startsWith('import ') || stripped.startsWith('export ')) continue;
    // ignore inside async function declarations (very rough heuristic)
    if (stripped.startsWith('async ') || stripped.includes('async (') || stripped.includes('async function')) continue;

    // If it looks like module-scope and not inside a block (extremely simple heuristic),
    // we still surface it for human review.
    hits.push({ line: i + 1, text: stripped });
  }

  if (hits.length) {
    return { file: rel, hits };
  }
  return null;
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.next')) continue;
    if (entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p, acc);
    } else if (/[.]tsx?$/.test(entry.name)) {
      const result = scanFile(p);
      if (result) acc.push(result);
    }
  }
}

function main() {
  const results = [];
  for (const sub of INCLUDED) {
    const dir = path.join(ROOT, sub);
    if (fs.existsSync(dir)) walk(dir, results);
  }
  if (!results.length) {
    console.log('No suspicious top-level `await` usage found.');
    return;
  }
  console.log(JSON.stringify(results, null, 2));
}

if (require.main === module) main();
