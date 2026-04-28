import assert from "node:assert";
import {
  padStandardMainboardWide,
  shouldStandardWuControlFallback,
  STANDARD_MAIN_PAD_MIN,
} from "@/lib/deck/generate-constructed-standard";
import { totalDeckQty } from "@/lib/deck/generation-helpers";

{
  const out = padStandardMainboardWide([{ name: "Mountain", qty: 45 }], ["W", "U"]);
  assert.equal(totalDeckQty(out.rows), 60);
  assert.equal(out.adjusted, true);
}

{
  assert.equal(
    shouldStandardWuControlFallback({
      format: "Standard",
      colors: ["W", "U"],
      archetype: "Control",
    }),
    true
  );
  assert.equal(
    shouldStandardWuControlFallback({
      format: "Modern",
      colors: ["W", "U"],
      archetype: "Control",
    }),
    false
  );
  assert.equal(
    shouldStandardWuControlFallback({
      format: "Standard",
      colors: ["R"],
      archetype: "Burn",
    }),
    false
  );
  assert.equal(
    shouldStandardWuControlFallback({
      format: "Pauper",
      colors: ["W", "U"],
      archetype: "Control",
    }),
    false
  );
  assert.equal(
    shouldStandardWuControlFallback({
      format: "Standard",
      colors: ["W", "U", "B"],
      archetype: "Control",
    }),
    false
  );
}

assert.ok(STANDARD_MAIN_PAD_MIN === 45);

console.log("generate-constructed-standard tests OK");
