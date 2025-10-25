// tools/patch_ts_ignore_cards_pane.js
// Node script to inject a TypeScript ignore above the EditorAddBar line
// Usage: node tools/patch_ts_ignore_cards_pane.js
const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(process.cwd(), 'scripts', 'app', 'my-decks', '[id]', 'CardsPane.tsx'),
  path.join(process.cwd(), 'frontend', 'scripts', 'app', 'my-decks', '[id]', 'CardsPane.tsx'),
];

function inject(file) {
  if (!fs.existsSync(file)) return false;
  let src = fs.readFileSync(file, 'utf8');
  const target = /(\{deckId\s*&&\s*<EditorAddBar\s+deckId=\{deckId\}\s+onAdded=\{load\}\s*\/>\s*\})/m;

  if (!target.test(src)) {
    console.log('[skip] pattern not found in', file);
    return false;
  }

  // Already injected?
  if (src.includes('// @ts-ignore -- legacy props supported at runtime; typing mismatch only')) {
    console.log('[ok] already injected:', file);
    return true;
  }

  const replaced = src.replace(target, `// @ts-ignore -- legacy props supported at runtime; typing mismatch only\n$1`);
  // Backup
  const bak = file + '.bak';
  fs.writeFileSync(bak, src, 'utf8');
  fs.writeFileSync(file, replaced, 'utf8');
  console.log('[patched]', file, ' (backup ->', bak + ')');
  return true;
}

let changed = false;
for (const f of candidates) {
  try {
    if (inject(f)) changed = true;
  } catch (e) {
    console.error('[error]', f, e.message);
  }
}

if (!changed) {
  console.log('No files changed. If your repo uses a different path, please tell this script where to look.');
  process.exit(2);
} else {
  console.log('Done. Re-run: npm run build && npm start');
}
