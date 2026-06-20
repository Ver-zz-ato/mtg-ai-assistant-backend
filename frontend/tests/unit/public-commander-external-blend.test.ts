/**
 * Run: npx tsx tests/unit/public-commander-external-blend.test.ts
 */
import assert from "node:assert";
import {
  blendCommanderMetaWithExternalProfiles,
  buildCommanderMetaShadowReport,
  readPublicCommanderExternalMetaFlags,
  sanitizeExternalCommanderProfileRow,
  type PublicCommanderMetaItem,
  type SanitizedExternalCommanderProfile,
} from "@/lib/meta/publicCommanderExternalBlend";

function commander(name: string, rank: number): PublicCommanderMetaItem {
  return {
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    rank,
    metaLabel: `EDHREC rank #${rank}`,
  };
}

const baseItems = [
  "Alpha Commander",
  "Bravo Commander",
  "Charlie Commander",
  "Delta Commander",
  "Echo Commander",
  "Foxtrot Commander",
  "Golf Commander",
  "Hotel Commander",
  "India Commander",
  "Juliet Commander",
].map((name, index) => commander(name, index + 1));

function profile(name: string, approvedSampleSize: number): SanitizedExternalCommanderProfile {
  return {
    commanderName: name,
    commanderNameNorm: name.toLowerCase(),
    approvedSampleSize,
    lastRefreshedAt: "2026-06-20T12:00:00.000Z",
  };
}

{
  const sanitized = sanitizeExternalCommanderProfileRow({
    commander_name: "Korvold, Fae-Cursed King",
    commander_name_norm: "korvold, fae-cursed king",
    approved_sample_size: 64,
    last_refreshed_at: "2026-06-20T12:00:00.000Z",
    confidence_score: 0.99,
    source_breakdown: { archidekt: 64 },
    profile_warnings: ["qa_only"],
    exclusion_reasons: ["do_not_leak"],
    role_variance: { ramp: 0.1 },
    support_gaps: [{ name: "Gap" }],
    raw_sample_size: 100,
  });
  assert.deepStrictEqual(sanitized, {
    commanderName: "Korvold, Fae-Cursed King",
    commanderNameNorm: "korvold, fae-cursed king",
    approvedSampleSize: 64,
    lastRefreshedAt: "2026-06-20T12:00:00.000Z",
  });
  const serialized = JSON.stringify(sanitized);
  for (const forbidden of [
    "confidence_score",
    "source_breakdown",
    "profile_warnings",
    "exclusion_reasons",
    "role_variance",
    "support_gaps",
    "raw_sample_size",
  ]) {
    assert(!serialized.includes(forbidden), `forbidden field leaked: ${forbidden}`);
  }
}

{
  assert.strictEqual(sanitizeExternalCommanderProfileRow({
    commander_name: "Tiny Sample",
    commander_name_norm: "tiny sample",
    approved_sample_size: 49,
  }), null);
}

{
  const result = blendCommanderMetaWithExternalProfiles(baseItems, [], 0.1);
  assert.strictEqual(result.report.applied, false);
  assert.deepStrictEqual(result.items.map((item) => item.name), baseItems.map((item) => item.name));
  assert.deepStrictEqual(result.report.shockWarnings, ["external_empty"]);
}

{
  const result = blendCommanderMetaWithExternalProfiles(baseItems, [profile("Charlie Commander", 500)], 0.2);
  assert.strictEqual(result.report.applied, true);
  assert.strictEqual(result.items[0]?.name, "Charlie Commander");
  assert(result.report.rankDeltas.some((row) => row.name === "Charlie Commander" && row.delta === 2));
}

{
  const result = blendCommanderMetaWithExternalProfiles(baseItems, [profile("Charlie Commander", 500)], 0);
  assert.strictEqual(result.report.applied, false);
  assert.deepStrictEqual(result.items.map((item) => item.name), baseItems.map((item) => item.name));
  assert.deepStrictEqual(result.report.shockWarnings, ["external_weight_zero"]);
}

{
  const longerBase = Array.from({ length: 30 }, (_, index) => commander(`Commander ${index + 1}`, index + 1));
  const result = blendCommanderMetaWithExternalProfiles(longerBase, [profile("Commander 30", 10_000)], 0.35);
  assert.strictEqual(result.report.applied, false);
  assert(result.report.shockWarnings.includes("top25_rank_movement_cap_exceeded"));
  assert.deepStrictEqual(result.items.map((item) => item.name), longerBase.map((item) => item.name));
}

{
  const report = buildCommanderMetaShadowReport(baseItems, [profile("Charlie Commander", 500)], 0.2);
  assert.strictEqual(report.currentTop10.length, 10);
  assert.strictEqual(report.blendedTop10.length, 10);
  assert.strictEqual(report.eligibleExternalProfiles, 1);
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "confidence_score",
    "source_breakdown",
    "profile_warnings",
    "exclusion_reasons",
    "role_variance",
    "support_gaps",
    "raw_sample_size",
  ]) {
    assert(!serialized.includes(forbidden), `forbidden field leaked in report: ${forbidden}`);
  }
}

async function runFlagTests() {
  const off = await readPublicCommanderExternalMetaFlags({
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: { value: {} }, error: null };
        },
      };
    },
  } as never);
  assert.strictEqual(off.websiteCommanderMetaPages, false);
  assert.strictEqual(off.apiMetaTrendingShadow, false);

  const on = await readPublicCommanderExternalMetaFlags({
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return {
            data: {
              value: {
                public_external_meta_enabled: true,
                public_external_meta_shadow_mode: true,
                public_external_meta_weight: 0.9,
                public_external_meta_surfaces: {
                  website_commander_meta_pages: true,
                  api_meta_trending_shadow: true,
                },
              },
            },
            error: null,
          };
        },
      };
    },
  } as never);
  assert.strictEqual(on.websiteCommanderMetaPages, true);
  assert.strictEqual(on.apiMetaTrendingShadow, true);
  assert.strictEqual(on.weight, 0.35);
}

runFlagTests()
  .then(() => {
    console.log("OK public-commander-external-blend");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
