// scripts/fix-collections-delta.js
// Safe patch: coerce delta to Number in /api/collections/cards PATCH route
// so +/- send strings or numbers and the server accepts both.

const fs = require("fs");
const path = require("path");

function findFile(rel) {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) {
    console.error(`❌ Not found: ${rel}`);
    process.exit(1);
  }
  return p;
}

const targetRel = "app/api/collections/cards/route.ts";
const target = findFile(targetRel);

// 1) backup
const backup = target + ".bak";
if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
  console.log(`🧰 Backup created: ${targetRel}.bak`);
} else {
  console.log(`ℹ️ Backup already exists: ${targetRel}.bak`);
}

// 2) read
let src = fs.readFileSync(target, "utf8");

// 3) make delta a Number(...) in the PATCH handler
// Replace the first `const delta = ...;` we see inside the PATCH function.
// This is intentionally broad but still safe: we replace only the first match.
const deltaRegex = /const\s+delta\s*=\s*[^;]+;/;

if (deltaRegex.test(src)) {
  src = src.replace(deltaRegex, "const delta = Number((body as any).delta);");
  console.log("✅ Replaced `const delta = ...` with numeric coercion.");
} else {
  // Fallback: insert right after `const body = await req.json();`
  const bodyRegex = /(const\s+body\s*=\s*await\s*req\.json\(\);\s*)/;
  if (bodyRegex.test(src)) {
    src = src.replace(
      bodyRegex,
      `$1\n    // Coerce delta so strings like "1" or "-1" are accepted\n    const delta = Number((body as any).delta);\n`
    );
    console.log("✅ Inserted numeric coercion after `const body = await req.json();`");
  } else {
    console.error("❌ Could not locate a place to insert delta coercion.");
    process.exit(1);
  }
}

// 4) (Optional-but-helpful) normalize the non-zero guard if present
// If the file contains the exact error string, ensure we use a robust check.
const guardMsg = "delta must be a non-zero number";
if (src.includes(guardMsg)) {
  // Try to find a simple guard and standardize it
  src = src.replace(
    /if\s*\((?:[^)]*delta[^)]*)\)\s*\{\s*return\s+NextResponse\.json\(\{\s*ok:\s*false,[^}]*\}\s*,\s*\{\s*status:\s*400\s*\}\s*\);\s*\}/,
    `if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ ok: false, error: "${guardMsg}" }, { status: 400 });
    }`
  );
  console.log("✅ Standardized delta guard to `Number.isFinite(delta) && delta !== 0`.");
} else {
  console.log("ℹ️ No explicit delta guard message found; leaving guard logic as-is.");
}

// 5) write back
fs.writeFileSync(target, src);
console.log(`🎯 Patched: ${targetRel}`);
console.log("Done.");
