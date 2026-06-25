/**
 * byName map keys use normalizeScryfallCacheName; tagCardRoles must resolve deck lines with the same norm.
 * Run: npx tsx tests/unit/inference-byName-key.test.ts
 */
import assert from "node:assert";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { canOverrideInferredColors, tagCardRoles } from "@/lib/deck/inference";

const nameWithAccent = "Juz\u00E1m Djinn";
const key = normalizeScryfallCacheName(nameWithAccent);
assert.strictEqual(key, normalizeScryfallCacheName("Juzam Djinn"));

const byName = new Map<
  string,
  { name: string; type_line?: string; oracle_text?: string | null; cmc?: number }
>();
byName.set(key, {
  name: nameWithAccent,
  type_line: "Creature — Djinn",
  oracle_text: "Flying",
  cmc: 6,
});

const roles = tagCardRoles([{ name: nameWithAccent, count: 1 }], null, byName as any);
assert.ok(roles.length > 0, "expected at least one role when card resolves");
assert.strictEqual(roles[0]?.name, nameWithAccent);

assert.strictEqual(
  canOverrideInferredColors("Commander", "Norman Osborn // Green Goblin", ["B", "R", "U"], ["U"]),
  false,
  "stale UI colors must not override a known Commander identity"
);
assert.strictEqual(
  canOverrideInferredColors("Commander", "Inti, Seneschal of the Sun", ["R"], ["R", "W"]),
  false,
  "saved deck colors must not turn a mono-red commander into Boros"
);
assert.strictEqual(
  canOverrideInferredColors("Modern", null, ["R"], ["R", "W"]),
  true,
  "constructed deck colors can still be overridden by explicit UI colors"
);

console.log("OK inference-byName-key");
