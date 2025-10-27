import { canonicalize, __setTestData } from "@/lib/cards/canonicalize";
import assert from "node:assert";

// Provide in-memory test data so this test is hermetic
__setTestData(
  { "l. bolt": "lightning bolt" },
  [ { name: "Lightning Bolt", oracle_id: "test-oracle" } ]
);

const out = canonicalize("L. Bolt");
assert.equal(out.canonicalName.toLowerCase(), "lightning bolt");
assert.equal(out.oracle_id, "test-oracle");

console.log("canonicalize.test.ts passed");