#!/usr/bin/env node
/**
 * Replay tier classification on quality-sentinel-prompts.json.
 * Verifies classifyPromptTier and layer0Decide consistency (no OpenAI call).
 * Run: npx tsx scripts/replay-tier-classification.mjs [--json]
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonMode = process.argv.includes("--json");

const promptsPath = path.join(__dirname, "../lib/data/quality-sentinel-prompts.json");
const data = JSON.parse(readFileSync(promptsPath, "utf-8"));
const prompts = data.prompts || [];

// Dynamic import for TS modules
const { classifyPromptTier } = await import("../lib/ai/prompt-tier");
const { layer0Decide } = await import("../lib/ai/layer0-gate");

let passed = 0;
let failed = 0;
const failures = [];

if (!jsonMode) {
  console.log("=== Tier + Layer0 Classification Replay ===\n");
}

for (const p of prompts) {
  const hasDeck = p.hasDeckContext === true;
  const deckContextForCompose = hasDeck ? { deckCards: [{ name: "Sol Ring" }] } : null;

  const tierResult = classifyPromptTier({
    text: p.text,
    hasDeckContext: hasDeck,
    deckContextForCompose,
  });

  const layer0Result = p.expectedLayer0
    ? layer0Decide({
        text: p.text,
        hasDeckContext: hasDeck,
        isAuthenticated: true,
        route: "chat",
      })
    : null;

  let ok = true;
  const issues = [];

  if (p.expectedTier && tierResult.tier !== p.expectedTier) {
    ok = false;
    issues.push(`tier: got ${tierResult.tier}, expected ${p.expectedTier}`);
  }
  if (p.expectedReason && tierResult.reason !== p.expectedReason) {
    ok = false;
    issues.push(`tier_reason: got ${tierResult.reason}, expected ${p.expectedReason}`);
  }
  if (p.expectedLayer0 && layer0Result && layer0Result.mode !== p.expectedLayer0) {
    ok = false;
    issues.push(`layer0: got ${layer0Result.mode}, expected ${p.expectedLayer0}`);
  }
  if (p.expectedLayer0Reason && layer0Result && "reason" in layer0Result && layer0Result.reason !== p.expectedLayer0Reason) {
    ok = false;
    issues.push(`layer0_reason: got ${layer0Result.reason}, expected ${p.expectedLayer0Reason}`);
  }

  if (ok) {
    passed++;
    if (!jsonMode) {
      console.log(`  OK ${p.id}: "${p.text.slice(0, 40)}..." → tier=${tierResult.tier}${layer0Result ? ` layer0=${layer0Result.mode}` : ""}`);
    }
  } else {
    failed++;
    failures.push({ id: p.id, text: p.text, issues });
    if (!jsonMode) {
      console.log(`  FAIL ${p.id}: "${p.text}"`);
      issues.forEach((i) => console.log(`      ${i}`));
    }
  }
}

if (jsonMode) {
  console.log(
    JSON.stringify({
      passed,
      failed,
      total: passed + failed,
      failures,
    })
  );
} else {
  console.log(`\n${passed} passed, ${failed} failed`);
}
process.exit(failed > 0 ? 1 : 0);
