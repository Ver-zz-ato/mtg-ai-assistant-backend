/**
 * Regression contract check for website /api/deck/analyze route source.
 *
 * This is intentionally lightweight and static:
 * - avoids booting full Next route runtime dependencies
 * - locks key defaults and response-field contract markers
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function includesAll(haystack: string, needles: string[]) {
  for (const needle of needles) {
    assert.ok(
      haystack.includes(needle),
      `Expected route source to include: ${needle}`
    );
  }
}

async function main() {
  const routePath = path.resolve(
    process.cwd(),
    "app/api/deck/analyze/route.ts"
  );
  const src = fs.readFileSync(routePath, "utf8");

  // 1) Website POST path should keep default core execution.
  assert.match(
    src,
    /export\s+async\s+function\s+POST\s*\(\s*req:\s*Request\s*\)\s*\{\s*return\s+runDeckAnalyzeCore\(req\);\s*\}/m,
    "POST(req) should call runDeckAnalyzeCore(req) with default options"
  );

  // 2) Default should include validated narrative (unless explicitly disabled).
  assert.match(
    src,
    /const\s+includeValidatedNarrative\s*=\s*options\?\.includeValidatedNarrative\s*!==\s*false;/m,
    "includeValidatedNarrative must default to true"
  );
  assert.match(
    src,
    /if\s*\(\s*includeValidatedNarrative\s*&&\s*useGPT\s*&&\s*deckAnalysisSystemPrompt\s*\)/m,
    "validated narrative path should still run for default website requests"
  );
  includesAll(src, ['generateValidatedDeckAnalysis']);

  // 3) Deterministic + narrative + additive metadata fields should remain present.
  includesAll(src, [
    "score,",
    "note,",
    "bands,",
    "counts:",
    "whatsGood,",
    "quickFixes,",
    "curveBuckets:",
    "suggestions,",
    "partial:",
    "filteredSummary:",
    "filteredReasons:",
    "filteredCount:",
    "prompt_version:",
    "prompt_version_id:",
    "analysis:",
    "analysis_json:",
    "analysis_validation_errors:",
    "analysis_validation_warnings:",
    "validated_analysis_ok:",
    "validated_analysis_code:",
    "validated_analysis_message:",
    "validated_analysis_errors:",
  ]);

  // 4) Intentional soft-fail pattern: response remains status 200.
  assert.match(
    src,
    /return\s+new\s+Response\([\s\S]*\{\s*status:\s*200,\s*headers:\s*\{\s*"content-type":\s*"application\/json"\s*\}\s*\}\s*\);/m,
    "Route should keep 200 JSON response for successful deterministic runs"
  );

  console.log("deck-analyze-route-regression: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

