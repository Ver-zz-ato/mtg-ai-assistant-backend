// scripts/patch-recent-decks.js
// Safely injects <RecentPublicDecks /> into the "Recent Decks" box on app/page.tsx
// - Creates a backup: app/page.tsx.bak
// - Adds the import at the top if missing
// - Replaces the first <ul> that follows a heading containing "Recent Decks"
const fs = require('fs')
const path = require('path')

const file = path.join(process.cwd(), 'app', 'page.tsx')
if (!fs.existsSync(file)) {
  console.error('Could not find app/page.tsx')
  process.exit(1)
}
const src = fs.readFileSync(file, 'utf8')
const backup = file + '.bak'
if (!fs.existsSync(backup)) fs.writeFileSync(backup, src)
console.log('Backed up:', backup)

let out = src

// 1) Ensure import
if (!out.includes('RecentPublicDecks')) {
  out = out.replace(/^(\s*['\"]use client['\"];\s*)?/,
    (m) => (m || '') + "\nimport RecentPublicDecks from \"@/components/RecentPublicDecks\";\n")
}

// 2) Find the "Recent Decks" heading position
const headingIdx = out.search(/>\s*Recent Decks\s*<\/\w+>/i)
if (headingIdx === -1) {
  console.warn('Could not locate "Recent Decks" heading. No changes applied.')
  fs.writeFileSync(file, out)
  process.exit(0)
}

// From heading forward, find the first <ul ...>...</ul> and replace it
const after = out.slice(headingIdx)
const ulStartRel = after.search(/<ul[^>]*>/i)
if (ulStartRel === -1) {
  console.warn('Heading found but no <ul> after it. No changes applied.')
  fs.writeFileSync(file, out)
  process.exit(0)
}
const ulStartAbs = headingIdx + ulStartRel

// Find end of that ul (primitive but effective)
const ulEndRel = after.slice(ulStartRel).search(/<\/ul\s*>/i)
if (ulEndRel === -1) {
  console.warn('Could not find </ul> after heading. No changes applied.')
  fs.writeFileSync(file, out)
  process.exit(0)
}
const ulEndAbs = ulStartAbs + ulEndRel + '</ul>'.length

const beforePart = out.slice(0, ulStartAbs)
const afterPart = out.slice(ulEndAbs)

const injected = beforePart + "\n  <RecentPublicDecks />\n" + afterPart
fs.writeFileSync(file, injected)
console.log('Injected <RecentPublicDecks /> into Recent Decks box.')
