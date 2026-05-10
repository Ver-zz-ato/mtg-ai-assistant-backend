import assert from "node:assert";
import {
  getFormatSupportEntry,
  normalizeFormatSupportKey,
  tryFormatSupportKeyToAnalyzeFormat,
} from "../../lib/deck/formatSupportMatrix";
import {
  normalizeDeckFormat,
  tryDeckFormatStringToAnalyzeFormat,
} from "../../lib/deck/formatRules";

function ok(condition: unknown, msg?: string) {
  assert.ok(condition, msg);
}

console.log("[format-support-matrix] canonical full-support formats");
ok(normalizeDeckFormat("Commander") === "commander");
ok(normalizeDeckFormat("pauper") === "pauper");
ok(tryDeckFormatStringToAnalyzeFormat("Modern") === "Modern");
ok(tryDeckFormatStringToAnalyzeFormat("Pioneer") === "Pioneer");

console.log("[format-support-matrix] limited formats stay out of first-class analysis");
ok(normalizeFormatSupportKey("Legacy") === "legacy");
ok(getFormatSupportEntry("Historic")?.supportLevel === "limited");
ok(tryFormatSupportKeyToAnalyzeFormat("Brawl") === null);
ok(tryDeckFormatStringToAnalyzeFormat("Vintage") === null);
ok(normalizeDeckFormat("Legacy") === null);

console.log("[format-support-matrix] aliases");
ok(normalizeFormatSupportKey("EDH") === "commander");
ok(normalizeFormatSupportKey("std") === "standard");
ok(normalizeFormatSupportKey("duel commander") === "commander");

console.log("[format-support-matrix] OK");
