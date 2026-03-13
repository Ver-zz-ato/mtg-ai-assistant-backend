/**
 * Quick runner for Test Suite V2 (admin scenarios).
 * Run: npx tsx scripts/run-test-suite-v2.ts
 */

import { runScenarios } from "../lib/admin/ai-v2/runner";
import { SCENARIOS } from "../lib/admin/ai-v2/scenarios";

async function main() {
  const results = await runScenarios(SCENARIOS);
  for (const r of results) {
    console.log(`${r.scenarioId}: ${r.pass ? "PASS" : "FAIL"} (${r.durationMs}ms)`);
    if (!r.pass && r.hardFailures.length) {
      console.log("  Hard:", r.hardFailures.map((f) => f.message).join("; "));
    }
  }
}

main().catch(console.error);
