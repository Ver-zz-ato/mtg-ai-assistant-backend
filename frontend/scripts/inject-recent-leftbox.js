// Ultra-safe injector: inserts <RecentPublicDecks /> into the "Recent Decks" box on app/page.tsx
// 1) Backs up app/page.tsx -> app/page.tsx.bak
// 2) Adds import if missing
// 3) Replaces the <ul> immediately following the "Recent Decks" heading with <RecentPublicDecks />
//    If no <ul> is found within the next ~2k chars, it inserts the component right after the heading.

const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
if (!fs.existsSync(pagePath)) {
  console.error(`Could not find ${pagePath}. Aborting.`);
  process.exit(1);
}

const original = fs.readFileSync(pagePath, "utf8");
const backupPath = pagePath + ".bak";
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, "utf8");
  console.log("Backed up:", backupPath);
} else {
  console.log("Backup already exists:", backupPath);
}

let code = original;

// Ensure import
if (!code.includes('RecentPublicDecks')) {
  const importLine = 'import RecentPublicDecks from "@/components/RecentPublicDecks";\n';
  // place after first import line
  const importIdx = code.indexOf("import ");
  if (importIdx >= 0) {
    const nextLineIdx = code.indexOf("\n", importIdx);
    code = code.slice(0, nextLineIdx + 1) + importLine + code.slice(nextLineIdx + 1);
  } else {
    code = importLine + code;
  }
}

// Find "Recent Decks" text
const headingIdx = code.search(/Recent\s+Decks/i);
if (headingIdx === -1) {
  console.log('Could not locate "Recent Decks" heading. No changes applied.');
  process.exit(0);
}

// Search for a UL after the heading
const searchWindow = code.slice(headingIdx, headingIdx + 4000);
const ulStartLocal = searchWindow.indexOf("<ul");
const headingLocalEnd = searchWindow.indexOf(">"); // end of the first tag that contains the words
let changed = false;

if (ulStartLocal !== -1) {
  const ulStart = headingIdx + ulStartLocal;
  // find matching </ul>
  const afterUl = code.slice(ulStart);
  const ulEndRel = afterUl.indexOf("</ul>");
  if (ulEndRel !== -1) {
    const ulEnd = ulStart + ulEndRel + "</ul>".length;
    code = code.slice(0, ulStart) + "<RecentPublicDecks />" + code.slice(ulEnd);
    changed = true;
    console.log('Replaced <ul> after "Recent Decks" with <RecentPublicDecks />.');
  }
}

if (!changed) {
  // Insert after heading tag end
  const tagEndLocal = searchWindow.indexOf(">");
  if (tagEndLocal !== -1) {
    const insertAt = headingIdx + tagEndLocal + 1;
    code = code.slice(0, insertAt) + "\n<RecentPublicDecks />\n" + code.slice(insertAt);
    changed = true;
    console.log('Inserted <RecentPublicDecks /> right after "Recent Decks" heading.');
  }
}

if (!changed) {
  console.log("No safe insertion point found. No changes applied.");
  process.exit(0);
}

fs.writeFileSync(pagePath, code, "utf8");
console.log("Done.");
