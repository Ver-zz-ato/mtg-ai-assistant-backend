/**
 * Run: npx tsx tests/unit/external-deck-meta.test.ts
 */
import assert from "node:assert";
import { commanderCoverageKey, communityProfileCoverageBucket } from "@/lib/external-deck-meta/coverage";
import { stableDeckHash } from "@/lib/external-deck-meta/hash";
import { buildCommunityProfileComparison } from "@/lib/external-deck-meta/publicComparison";
import type { BuildCommunityProfileComparisonInput } from "@/lib/external-deck-meta/publicComparison";
import { retryAfterToCooldownIso } from "@/lib/external-deck-meta/rateLimit";
import { isTransientSupabaseError, supabaseBackoffDelayMs, withSupabaseRetry } from "@/lib/external-deck-meta/supabaseRetry";
import { parseExternalDeckUrl } from "@/lib/external-deck-meta/url";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

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
  assert.strictEqual(commanderCoverageKey("Atraxa, Praetors' Voice"), commanderCoverageKey("Atraxa Praetors Voice"));
  assert.strictEqual(communityProfileCoverageBucket(50, 0.55), "eligible");
  assert.strictEqual(communityProfileCoverageBucket(64, 0.54), "needs_confidence_review");
  assert.strictEqual(communityProfileCoverageBucket(25, 0.1), "usable_qa");
  assert.strictEqual(communityProfileCoverageBucket(10, 0.1), "early_signal");
  assert.strictEqual(communityProfileCoverageBucket(9, 0.9), "not_ready");
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

{
  assert.strictEqual(isTransientSupabaseError(new Error("TypeError: fetch failed")), true);
  assert.strictEqual(isTransientSupabaseError(new Error("timeout waiting for response")), true);
  assert.strictEqual(isTransientSupabaseError(new Error("column does not exist")), false);
  assert.strictEqual(supabaseBackoffDelayMs(1, 100, 1000), 125);
  assert.strictEqual(supabaseBackoffDelayMs(4, 100, 500), 500);
}

type FakeExternalProfile = {
  commander_name: string;
  approved_sample_size: number;
  confidence_score: number;
  averages?: Record<string, number>;
  common_cards?: Array<{ name: string; inclusion_rate?: number }>;
  source_breakdown?: Record<string, number>;
  profile_warnings?: string[];
  support_gaps?: Array<{ name: string }>;
};

type FakeAdmin = BuildCommunityProfileComparisonInput["admin"];

function fakeComparisonClient(profile: FakeExternalProfile | null, facts: Array<{ name: string; color_identity?: string[] }>): FakeAdmin {
  return {
    from(table: string) {
      if (table === "external_commander_profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return {
                          async maybeSingle() {
                            return { data: profile, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "scryfall_cache") {
        return {
          select() {
            return {
              async in(_column: string, keys: string[]) {
                return {
                  data: facts.filter((fact) => keys.includes(normalizeScryfallCacheName(fact.name))),
                  error: null,
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table:${table}`);
    },
  } as unknown as FakeAdmin;
}

const eligibleProfile = {
  commander_name: "Korvold, Fae-Cursed King",
  approved_sample_size: 64,
  confidence_score: 0.589,
  averages: { lands: 37, ramp: 23.7, draw: 7.4, removal: 7.6, protection: 2.8 },
  source_breakdown: { archidekt: 64 },
  profile_warnings: ["single_source_profile"],
  support_gaps: [{ name: "Do Not Leak" }],
  common_cards: [
    { name: "Sol Ring", inclusion_rate: 0.88 },
    { name: "Mayhem Devil", inclusion_rate: 0.78 },
    { name: "Tireless Provisioner", inclusion_rate: 0.63 },
    { name: "Pitiless Plunderer", inclusion_rate: 0.47 },
    { name: "Deadly Dispute", inclusion_rate: 0.41 },
    { name: "Rhystic Study", inclusion_rate: 0.4 },
    { name: "Forest", inclusion_rate: 0.86 },
  ],
};

async function runCommunityProfileComparisonTests() {
  let attempts = 0;
  const delays: number[] = [];
  const retried = await withSupabaseRetry(
    {
      operation: "unit_retry",
      table: "external_deck_cards",
      range: "0-999",
      attempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 2,
      sleep: async (ms) => {
        delays.push(ms);
      },
    },
    async () => {
      attempts += 1;
      if (attempts < 2) throw new Error("fetch failed");
      return "ok";
    }
  );
  assert.strictEqual(retried, "ok");
  assert.strictEqual(attempts, 2);
  assert.strictEqual(delays.length, 1);

  let nonTransientAttempts = 0;
  await assert.rejects(
    () =>
      withSupabaseRetry(
        {
          operation: "unit_non_transient",
          attempts: 3,
          sleep: async () => undefined,
        },
        async () => {
          nonTransientAttempts += 1;
          throw new Error("column does not exist");
        }
      ),
    /column does not exist/
  );
  assert.strictEqual(nonTransientAttempts, 1);

  const result = await buildCommunityProfileComparison({
    admin: fakeComparisonClient(eligibleProfile, [
      { name: "Korvold, Fae-Cursed King", color_identity: ["B", "G", "R"] },
      { name: "Sol Ring", color_identity: [] },
      { name: "Mayhem Devil", color_identity: ["B", "R"] },
      { name: "Tireless Provisioner", color_identity: ["G"] },
      { name: "Pitiless Plunderer", color_identity: ["B"] },
      { name: "Deadly Dispute", color_identity: ["B"] },
      { name: "Rhystic Study", color_identity: ["U"] },
      { name: "Forest", color_identity: [] },
    ]),
    format: "Commander",
    commander: "Korvold, Fae-Cursed King",
    deckCards: [{ name: "Forest", qty: 1 }],
    counts: { lands: 34, ramp: 8, draw: 7, removal: 5, protection: 2 },
  });
  assert(result);
  assert.strictEqual(result.title, "Community Profile");
  assert.strictEqual(result.subtitle, "Based on 64 approved community decklists");
  assert.strictEqual(result.approvedSampleSize, 64);
  assert.deepStrictEqual(result.metrics.find((m) => m.label === "Protection"), {
    label: "Protection",
    yourDeck: 2,
    profileAverage: 2.8,
    delta: -0.8,
  });
  assert.deepStrictEqual(result.missingCommonCards.map((card) => card.name), [
    "Sol Ring",
    "Mayhem Devil",
    "Tireless Provisioner",
    "Pitiless Plunderer",
    "Deadly Dispute",
  ]);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("confidence"));
  assert(!serialized.includes("source_breakdown"));
  assert(!serialized.includes("profile_warnings"));
  assert(!serialized.includes("support_gaps"));
  assert(!serialized.includes("Rhystic Study"));
  assert(!serialized.includes("Forest"));

  const lowSample = await buildCommunityProfileComparison({
    admin: fakeComparisonClient({ ...eligibleProfile, approved_sample_size: 49 }, []),
    format: "Commander",
    commander: "Korvold, Fae-Cursed King",
    deckCards: [],
    counts: { lands: 34, ramp: 8, draw: 7, removal: 5, protection: 2 },
  });
  assert.strictEqual(lowSample, null);

  const lowConfidence = await buildCommunityProfileComparison({
    admin: fakeComparisonClient({ ...eligibleProfile, confidence_score: 0.54 }, []),
    format: "Commander",
    commander: "Korvold, Fae-Cursed King",
    deckCards: [],
    counts: { lands: 34, ramp: 8, draw: 7, removal: 5, protection: 2 },
  });
  assert.strictEqual(lowConfidence, null);

  const nonCommander = await buildCommunityProfileComparison({
    admin: fakeComparisonClient(eligibleProfile, []),
    format: "Modern",
    commander: "Korvold, Fae-Cursed King",
    deckCards: [],
    counts: { lands: 20, ramp: 0, draw: 4, removal: 6, protection: 0 },
  });
  assert.strictEqual(nonCommander, null);
}

runCommunityProfileComparisonTests()
  .then(() => {
    console.log("OK external-deck-meta");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
