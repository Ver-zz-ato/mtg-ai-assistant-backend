\
/**
 * Safe injector for the "RecentPublicDecks" widget into the left "Recent Decks" box.
 * - Looks for the text "Recent Decks" in app/page.tsx
 * - Replaces the first <ul>..</ul> after that heading with <RecentPublicDecks />
 * - Adds the import line if missing
 * - Creates a .bak file first
 *
 * Usage: node scripts/safe-inject-recent.js
 */
const fs = require('fs');
const path = require('path');

const PAGE_PATHS = [
  path.join('app', 'page.tsx'),
  path.join('app', '(site)', 'page.tsx'),
];

function backup(file) {
  const bak = file + '.bak';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backed up:', bak);
  }
}

function ensureImport(src) {
  const importLine = `import RecentPublicDecks from "@/components/RecentPublicDecks";`;
  if (src.includes(importLine)) return src;
  // Put after the last import line
  const importBlock = src.match(/^(?:import.*\n)+/m);
  if (importBlock) {
    const idx = importBlock.index + importBlock[0].length;
    return src.slice(0, idx) + importLine + "\n" + src.slice(idx);
  }
  return importLine + "\n" + src;
}

function replaceListAfterHeading(src) {
  const headingIdx = src.indexOf('Recent Decks');
  if (headingIdx === -1) return { changed: false, src };

  // find next <ul ...> after heading
  const ulStart = src.indexOf('<ul', headingIdx);
  if (ulStart !== -1) {
    const ulEnd = src.indexOf('</ul>', ulStart);
    if (ulEnd !== -1) {
      const before = src.slice(0, ulStart);
      const after = src.slice(ulEnd + 5);
      return {
        changed: true,
        src: before + '<RecentPublicDecks />' + after
      };
    }
  }

  // Fallback: insert the component 100 chars after the heading
  const insertAt = headingIdx + 'Recent Decks'.length + 100;
  const clamped = Math.min(src.length, Math.max(headingIdx, insertAt));
  return {
    changed: true,
    src: src.slice(0, clamped) + '\n<RecentPublicDecks />\n' + src.slice(clamped)
  };
}

function run() {
  const target = PAGE_PATHS.find(p => fs.existsSync(p));
  if (!target) {
    console.log('Could not locate app/page.tsx');
    process.exit(2);
  }

  let src = fs.readFileSync(target, 'utf8');
  if (src.includes('<RecentPublicDecks')) {
    console.log('Already injected. Nothing to do.');
    return;
  }

  const original = src;
  src = ensureImport(src);
  const { changed, src: out } = replaceListAfterHeading(src);
  if (!changed) {
    console.log('Could not locate "Recent Decks" heading. No changes applied.');
    return;
  }

  backup(target);
  fs.writeFileSync(target, out, 'utf8');
  console.log('Injected <RecentPublicDecks /> into "Recent Decks" box.');
}

run();
