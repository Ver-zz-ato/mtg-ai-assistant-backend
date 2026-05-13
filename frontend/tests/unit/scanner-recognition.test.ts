/**
 * Scanner recognition contract tests.
 * Run: npx tsx tests/unit/scanner-recognition.test.ts
 */
import assert from "node:assert";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/cards/recognize-image/route";
import { SCAN_AI_FREE, SCAN_AI_GUEST, SCAN_AI_PRO } from "@/lib/feature-limits";
import {
  canAutoAddScannerRecognition,
  scannerConfidenceScore,
} from "@/lib/scanner/recognition";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";

async function postForm(form: FormData) {
  const req = new NextRequest("http://localhost/api/cards/recognize-image", {
    method: "POST",
    body: form,
  });
  return POST(req);
}

async function main() {
  // Cheap multipart validation should fail before auth/rate-limit/OpenAI work.
  {
  const res = await postForm(new FormData());
  const json = await res.json();
  assert.equal(res.status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error, "no_image");
  }

  {
  const form = new FormData();
  form.append("image", new Blob(["gif89a"], { type: "image/gif" }), "card.gif");
  const res = await postForm(form);
  const json = await res.json();
  assert.equal(res.status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error, "unsupported_format");
  }

  {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/jpeg" }), "card.jpg");
  const res = await postForm(form);
  const json = await res.json();
  assert.equal(res.status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error, "image_too_large");
  }

// Confidence and auto-add contract used by the app for safe auto-add decisions.
assert.equal(scannerConfidenceScore("high"), 0.9);
assert.equal(scannerConfidenceScore("medium"), 0.65);
assert.equal(scannerConfidenceScore("low"), 0.35);

assert.equal(
  canAutoAddScannerRecognition({
    confidence: "high",
    validationSource: "cache_exact",
    ctx: null,
    validatedName: "Sol Ring",
  }),
  true,
  "cache-exact high confidence can auto-add"
);

assert.equal(
  canAutoAddScannerRecognition({
    confidence: "medium",
    validationSource: "cache_exact",
    ctx: null,
    validatedName: "Sol Ring",
  }),
  false,
  "medium confidence must still require confirmation"
);

assert.equal(
  canAutoAddScannerRecognition({
    confidence: "high",
    validationSource: "fuzzy_api_matches",
    ctx: { fuzzyMatches: [{ name: "Sol Ring", score: 0.97 }] },
    validatedName: "Sol Ring",
  }),
  true,
  "high confidence fuzzy result can auto-add when it agrees with scanner context"
);

assert.equal(
  canAutoAddScannerRecognition({
    confidence: "high",
    validationSource: "fuzzy_api_matches",
    ctx: { fuzzyMatches: [{ name: "Soul Ransom", score: 0.72 }] },
    validatedName: "Sol Ring",
  }),
  false,
  "high confidence fuzzy result still requires confirmation when context disagrees"
);

assert.equal(SCAN_AI_GUEST, 3);
assert.equal(SCAN_AI_FREE, 10);
assert.equal(SCAN_AI_PRO, 100);

console.log("scanner-recognition.test.ts: all assertions passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
export {};
