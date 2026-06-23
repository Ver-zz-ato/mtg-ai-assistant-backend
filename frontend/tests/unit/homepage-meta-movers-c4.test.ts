import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const homepageMetaFiles = [
  "components/home/HomeMetaMoverRotator.tsx",
  "components/TrendingCommandersStrip.tsx",
  "components/MetaDeckPanel.tsx",
];

const forbiddenSourcePatterns = [
  "external_commander_profiles",
  "external_decks",
  "external_deck_cards",
];

const forbiddenPublicFields = [
  "confidence_score",
  "source_breakdown",
  "profile_warnings",
  "exclusion_reasons",
  "role_variance",
  "support_gaps",
  "raw_sample_size",
  "externalApprovedSampleSize",
  "approved_sample_size",
];

function readRelative(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function run() {
  for (const relativePath of homepageMetaFiles) {
    const source = readRelative(relativePath);

    assert.match(
      source,
      /\/api\/meta\/trending/,
      `${relativePath} should inherit homepage meta movers from /api/meta/trending`,
    );

    for (const forbidden of forbiddenSourcePatterns) {
      assert.doesNotMatch(
        source,
        new RegExp(forbidden),
        `${relativePath} must not query public external meta tables directly`,
      );
    }

    for (const forbidden of forbiddenPublicFields) {
      assert.doesNotMatch(
        source,
        new RegExp(forbidden),
        `${relativePath} must not expose external QA/internal fields`,
      );
    }
  }

  const rotator = readRelative("components/home/HomeMetaMoverRotator.tsx");
  assert.match(
    rotator,
    /\/api\/meta\/trending\?window=today/,
    "Homepage rotator should use the today view inherited from /api/meta/trending",
  );
  assert.match(rotator, /return null;/, "Homepage rotator should keep empty/failure fallback hidden");

  console.log("OK homepage-meta-movers-c4");
}

run();
