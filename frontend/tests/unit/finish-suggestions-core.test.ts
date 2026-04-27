import assert from "node:assert";
import {
  computeFinishTargetStats,
  parseFinishSuggestionsJson,
  resolveFinishAnalyzeFormat,
} from "../../lib/deck/finish-suggestions-core";

function ok(condition: unknown, msg?: string) {
  assert.ok(condition, msg);
}

console.log("[finish-suggestions-core] resolveFinishAnalyzeFormat");
ok(resolveFinishAnalyzeFormat("modern", null) === "Modern");
ok(resolveFinishAnalyzeFormat(undefined, "Pioneer") === "Pioneer");
ok(resolveFinishAnalyzeFormat("Legacy", null) === null);
ok(resolveFinishAnalyzeFormat(undefined, undefined) === null);

console.log("[finish-suggestions-core] computeFinishTargetStats");
const modernOne = computeFinishTargetStats("Modern", "Mainboard\n1 Lightning Bolt");
ok(modernOne.deckSize === 60);
ok(modernOne.currentMainboardCount === 1);
ok(modernOne.missingMainboardSlots === 59);

const cmdSparse = computeFinishTargetStats(
  "Commander",
  "1 Animar, Soul of Elements\n30 Snow-Covered Forest\n",
);
ok(cmdSparse.deckSize === 100);
ok(cmdSparse.missingMainboardSlots === 69);

console.log("[finish-suggestions-core] parseFinishSuggestionsJson");
const parsed = parseFinishSuggestionsJson(
  '{"suggestions":[{"card":"Test Bolt","qty":2,"zone":"mainboard","role":"Removal","reason":"Burn","priority":"high","confidence":0.9}]}',
);
ok(parsed.warnings.length === 0);
const fenced = parseFinishSuggestionsJson(
  "```json\n{\"suggestions\":[{\"card\":\"Abigail Forest Beast\",\"qty\":1}]}\n```",
);
ok(fenced.suggestions.length === 1);

console.log("[finish-suggestions-core] OK");
