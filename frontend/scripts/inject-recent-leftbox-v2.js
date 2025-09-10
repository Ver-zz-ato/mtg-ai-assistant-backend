
/**
 * Robust injector: finds the "Recent Decks" box and replaces the next <ul>…</ul>
 * with <RecentPublicDecks />. If no <ul> is found within 1500 chars after the heading,
 * it inserts the component right after the heading closing tag.
 *
 * Usage: node scripts/inject-recent-leftbox-v2.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SEARCH_DIRS = ["app", "components"];
const TARGET_LABEL = /Recent\s+Decks/i;

function listTsxFiles(dir) {
  let out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith(".")) continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      out = out.concat(listTsxFiles(p));
    } else if (name.isFile() && /\.tsx?$/.test(name.name) && !name.name.endsWith(".bak")) {
      out.push(p);
    }
  }
  return out;
}

function ensureImport(src) {
  const importLine = `import RecentPublicDecks from "@/components/RecentPublicDecks";`;
  if (src.includes(importLine)) return src;
  // Insert after last import
  const importBlock = [...src.matchAll(/^\s*import .*;$/gm)];
  if (importBlock.length > 0) {
    const last = importBlock[importBlock.length - 1];
    const idx = last.index + last[0].length;
    return src.slice(0, idx) + "\n" + importLine + "\n" + src.slice(idx);
  }
  // Otherwise, add at top
  return importLine + "\n" + src;
}

function injectIntoFile(file) {
  const original = fs.readFileSync(file, "utf8");
  const m = original.match(/<h[1-6][^>]*>\s*Recent\s+Decks\s*<\/h[1-6]>/i);
  if (!m) return false;

  const startIdx = m.index + m[0].length;
  const afterHeading = original.slice(startIdx);
  // Try to replace the *next* <ul>…</ul> with the component
  const ulMatch = afterHeading.match(/<ul[\s\S]*?<\/ul>/i);
  let newSrc;
  if (ulMatch && ulMatch.index < 1500) {
    const before = original.slice(0, startIdx);
    const after = afterHeading.slice(ulMatch.index + ulMatch[0].length);
    newSrc = before + "\n<RecentPublicDecks />\n" + after;
  } else {
    // No <ul> nearby; insert right after the heading
    newSrc = original.slice(0, startIdx) + "\n<RecentPublicDecks />\n" + original.slice(startIdx);
  }

  newSrc = ensureImport(newSrc);

  // Backup once
  const bak = file + ".bak";
  if (!fs.existsSync(bak)) {
    fs.writeFileSync(bak, original, "utf8");
    console.log("Backed up:", bak);
  } else {
    console.log("Backup already exists:", bak);
  }

  fs.writeFileSync(file, newSrc, "utf8");
  console.log("Patched:", file);
  return true;
}

(function main() {
  let patched = false;
  for (const dir of SEARCH_DIRS) {
    const p = path.join(ROOT, dir);
    if (!fs.existsSync(p)) continue;
    const files = listTsxFiles(p);
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (TARGET_LABEL.test(src)) {
        if (injectIntoFile(f)) {
          patched = true;
          console.log("✅ Injection succeeded in:", f);
          break;
        }
      }
    }
    if (patched) break;
  }
  if (!patched) {
    console.log('❌ Could not locate a heading that contains "Recent Decks" in any .tsx under /app or /components.');
    console.log("Tip: ensure the heading literally contains the text: Recent Decks");
  }
})();
