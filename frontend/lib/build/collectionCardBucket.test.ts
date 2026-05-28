import assert from "node:assert/strict";
import { getCollectionCardBucket } from "./collectionCardBucket";

assert.equal(getCollectionCardBucket({ is_land: true, type_line: "Basic Land" }), "lands");
assert.equal(getCollectionCardBucket({ is_creature: true, type_line: "Legendary Creature" }), "creatures");
assert.equal(getCollectionCardBucket({ is_instant: true, type_line: "Instant" }), "spells");
assert.equal(getCollectionCardBucket({ is_artifact: true, type_line: "Artifact" }), "other");

console.log("collectionCardBucket.test.ts: ok");
