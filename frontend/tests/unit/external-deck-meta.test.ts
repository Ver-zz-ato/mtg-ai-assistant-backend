/**
 * Run: npx tsx tests/unit/external-deck-meta.test.ts
 */
import assert from "node:assert";
import { stableDeckHash } from "@/lib/external-deck-meta/hash";
import { retryAfterToCooldownIso } from "@/lib/external-deck-meta/rateLimit";
import { parseExternalDeckUrl } from "@/lib/external-deck-meta/url";

{
  const parsed = parseExternalDeckUrl("https://archidekt.com/decks/123456/my-deck");
  assert.deepStrictEqual(parsed, {
    sourceKey: "archidekt",
    externalId: "123456",
    canonicalUrl: "https://archidekt.com/decks/123456",
  });
}

{
  const parsed = parseExternalDeckUrl("https://moxfield.com/decks/abc_DEF-123");
  assert.deepStrictEqual(parsed, {
    sourceKey: "moxfield",
    externalId: "abc_DEF-123",
    canonicalUrl: "https://moxfield.com/decks/abc_DEF-123",
  });
}

{
  assert.strictEqual(parseExternalDeckUrl("https://example.com/decks/123"), null);
  assert.strictEqual(parseExternalDeckUrl("https://moxfield.com/users/name"), null);
}

{
  const a = stableDeckHash({
    format: "Commander",
    commanders: ["Korvold, Fae-Cursed King"],
    cards: [
      { name: "Sol Ring", quantity: 1, board: "mainboard" },
      { name: "Forest", quantity: 10, board: "mainboard" },
    ],
  });
  const b = stableDeckHash({
    format: "commander",
    commanders: ["Korvold, Fae-Cursed King"],
    cards: [
      { name: "Forest", quantity: 10, board: "mainboard" },
      { name: "Sol Ring", quantity: 1, board: "mainboard" },
    ],
  });
  assert.strictEqual(a, b);
}

{
  const before = Date.now();
  const iso = retryAfterToCooldownIso("120", 6);
  const delta = Date.parse(iso) - before;
  assert(delta >= 119_000 && delta <= 121_000);
}

console.log("OK external-deck-meta");
