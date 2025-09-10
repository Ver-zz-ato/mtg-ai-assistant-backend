\
// Ultra-safe injector that targets the left sidebar "Recent Decks" block.
// It looks for either the literal heading text OR the sample deck names (Yuriko/Atraxa/Korvold)
// and replaces the <ul>…</ul> list with <RecentPublicDecks />.
// If it can't find the <ul>, it will insert the component right after the heading.
// Creates a .bak next to any modified file. Does nothing if already patched.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SEARCH_DIRS = ['components', 'app']; // search both
const COMPONENT_IMPORT_LINE = `import RecentPublicDecks from "./RecentPublicDecks";`;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function backup(file) {
  const bak = file + '.bak';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backed up:', bak);
  }
}

function ensureImport(source, filePath) {
  // Figure out correct relative path to components/RecentPublicDecks.tsx
  const rel = path.relative(path.dirname(filePath), path.join(ROOT, 'components', 'RecentPublicDecks')).replace(/\\/g, '/');
  const importLine = `import RecentPublicDecks from "${rel.startsWith('.') ? rel : './' + rel}";`;
  if (!source.includes('RecentPublicDecks')) {
    return importLine + '\n' + source;
  }
  return source;
}

function tryPatch(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('<RecentPublicDecks')) {
    return false; // already patched
  }

  const hasHeading = /Recent\s+Decks/i.test(src);
  const hasSampleNames = /(Yuriko|Atraxa|Korvold)/i.test(src);

  if (!hasHeading && !hasSampleNames && !/LeftSidebar/i.test(src)) {
    return false;
  }

  // Strategy:
  // If we see 'Yuriko' (or sample names), try to replace the nearest <ul>…</ul>
  if (hasSampleNames) {
    const idx = src.search(/Yuriko|Atraxa|Korvold/i);
    if (idx !== -1) {
      // find nearest <ul before idx
      const before = src.lastIndexOf('<ul', idx);
      const after = src.indexOf('</ul>', idx);
      if (before !== -1 && after !== -1) {
        const patched = src.slice(0, before) + '<RecentPublicDecks />' + src.slice(after + 5);
        src = ensureImport(patched, file);
        backup(file);
        fs.writeFileSync(file, src, 'utf8');
        console.log('✅ Replaced static list in:', file);
        return true;
      }
    }
  }

  // If heading exists, try to insert component right after it
  if (hasHeading) {
    const hIdx = src.search(/Recent\s+Decks/i);
    if (hIdx !== -1) {
      const insertPos = src.indexOf('\n', hIdx);
      const patched = src.slice(0, insertPos + 1) + '<RecentPublicDecks />\n' + src.slice(insertPos + 1);
      src = ensureImport(patched, file);
      backup(file);
      fs.writeFileSync(file, src, 'utf8');
      console.log('✅ Inserted after heading in:', file);
      return true;
    }
  }

  // Fallback: if file name looks like LeftSidebar, insert near top of returned JSX
  if (/LeftSidebar/i.test(file)) {
    const retIdx = src.indexOf('return (');
    if (retIdx !== -1) {
      const insertPos = src.indexOf('\n', retIdx);
      const patched = src.slice(0, insertPos + 1) + '<RecentPublicDecks />\n' + src.slice(insertPos + 1);
      src = ensureImport(patched, file);
      backup(file);
      fs.writeFileSync(file, src, 'utf8');
      console.log('✅ Inserted at top of LeftSidebar in:', file);
      return true;
    }
  }

  return false;
}

(function main() {
  let patchedAny = false;
  for (const dir of SEARCH_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    const files = walk(full);
    for (const f of files) {
      try {
        if (tryPatch(f)) {
          patchedAny = true;
          break;
        }
      } catch (e) {
        console.error('Error inspecting', f, e);
      }
    }
    if (patchedAny) break;
  }
  if (!patchedAny) {
    console.log('❌ Could not find a suitable spot to inject. Try running me again after ensuring the static Yuriko/Atraxa/Korvold list is present or the heading says "Recent Decks".');
    process.exit(1);
  }
})();
