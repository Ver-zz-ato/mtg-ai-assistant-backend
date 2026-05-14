import assert from "node:assert/strict";
import { classifyCardRoles, summarizeDeckRoles } from "../../lib/deck/role-classifier";

const solRing = classifyCardRoles({
  name: "Sol Ring",
  qty: 1,
  type_line: "Artifact",
  oracle_text: "{T}: Add {C}{C}.",
  is_land: false,
});
assert.ok(solRing.roles.includes("ramp"), "Sol Ring should classify as ramp");

const swords = classifyCardRoles({
  name: "Swords to Plowshares",
  qty: 1,
  type_line: "Instant",
  oracle_text: "Exile target creature. Its controller gains life equal to its power.",
  is_land: false,
});
assert.ok(swords.roles.includes("removal"), "Swords should classify as removal");
assert.ok(swords.roles.includes("interaction"), "Swords should classify as interaction");

const craterhoof = classifyCardRoles({
  name: "Craterhoof Behemoth",
  qty: 1,
  type_line: "Creature - Beast",
  oracle_text: "When Craterhoof Behemoth enters the battlefield, creatures you control get +X/+X and gain trample until end of turn.",
  cmc: 8,
  is_creature: true,
});
assert.ok(craterhoof.roles.includes("wincon"), "Large creature finisher should classify as wincon");

const summary = summarizeDeckRoles([
  { name: "Forest", qty: 36, type_line: "Basic Land - Forest", is_land: true },
  { name: "Sol Ring", qty: 1, type_line: "Artifact", oracle_text: "{T}: Add {C}{C}.", is_land: false },
]);
assert.equal(summary.byRole.land, 36);
assert.equal(summary.byRole.ramp, 1);

console.log("role-classifier tests passed");
