import assert from "node:assert/strict";
import { buildFallbackWhyPayload } from "@/lib/deck/transform-why-fallback";

async function main() {
  const payload = buildFallbackWhyPayload({
    sourceRows: [
      { name: "Sol Ring", qty: 1 },
      { name: "Forest", qty: 10 },
    ],
    resultRows: [
      { name: "Arcane Signet", qty: 1 },
      { name: "Forest", qty: 10 },
    ],
    transformIntent: "tighten_curve",
    summary: "Transformed: Curve tightening. Power Casual, budget Moderate. Avg CMC ~3.33.",
    commanderName: "Ghired, Conclave Exile",
  });

  assert.ok(payload.overallWhy.includes("targeted change"));
  assert.ok(payload.changeReasons?.added?.["arcane signet"]);
  assert.ok(payload.changeReasons?.removed?.["sol ring"]);

  const noop = buildFallbackWhyPayload({
    sourceRows: [{ name: "Forest", qty: 10 }],
    resultRows: [{ name: "Forest", qty: 10 }],
    transformIntent: "general",
    summary: "No changes",
  });
  assert.equal(noop.changeReasons, null);

  console.log("transform-why-fallback tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
