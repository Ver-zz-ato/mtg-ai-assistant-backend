/**
 * byName map keys use normalizeScryfallCacheName; tagCardRoles must resolve deck lines with the same norm.
 * Run: npx tsx tests/unit/inference-byName-key.test.ts
 */
import assert from "node:assert";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { tagCardRoles } from "@/lib/deck/inference";

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

console.log("OK inference-byName-key");
