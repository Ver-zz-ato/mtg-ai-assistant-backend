import assert from "node:assert/strict";
import { getCommanderColorIdentityFromDetails, norm } from "@/lib/deck/generation-helpers";

function detailMap(rows: Record<string, { color_identity?: string[] | null }>) {
  return new Map(Object.entries(rows).map(([name, row]) => [norm(name), row]));
}

assert.deepEqual(
  getCommanderColorIdentityFromDetails(
    "Norman Osborn // Green Goblin",
    detailMap({
      "Norman Osborn // Green Goblin": { color_identity: ["B", "R", "U"] },
      "Norman Osborn": { color_identity: ["U"] },
      "Green Goblin": { color_identity: ["R"] },
    }),
  ),
  ["U", "B", "R"],
  "AI Workshop should prefer the full DFC commander identity, not the front-face colors",
);

assert.deepEqual(
  getCommanderColorIdentityFromDetails(
    "Inti, Seneschal of the Sun",
    detailMap({
      "Inti, Seneschal of the Sun": { color_identity: ["R"] },
    }),
  ),
  ["R"],
  "AI Workshop should keep Inti mono-red",
);

assert.deepEqual(
  getCommanderColorIdentityFromDetails(
    "Partner Alpha // Partner Beta",
    detailMap({
      "Partner Alpha": { color_identity: ["G"] },
      "Partner Beta": { color_identity: ["U"] },
    }),
  ),
  ["U", "G"],
  "partner-style commander notation should still combine both identities when no full card row exists",
);

console.log("ai-workshop-commander-colors tests passed");
