/**
 * Run: npx tsx tests/unit/external-commander-page-profile.test.ts
 */
import assert from "node:assert";
import {
  getCommanderPageCommunityProfile,
  type CommanderPageCommunityProfile,
} from "@/lib/external-deck-meta/commanderPageProfile";

type FakeProfile = {
  commander_name: string;
  commander_name_norm: string;
  approved_for_public: boolean;
  approved_sample_size: number;
  confidence_score: number;
  averages?: Record<string, unknown>;
  common_cards?: Array<Record<string, unknown>>;
  last_refreshed_at?: string;
  confidence_components?: Record<string, unknown>;
  source_breakdown?: Record<string, unknown>;
  profile_warnings?: string[];
  exclusion_reasons?: string[];
  role_variance?: Record<string, unknown>;
  support_gaps?: Array<Record<string, unknown>>;
  raw_sample_size?: number;
};

type Filter = {
  type: "eq" | "gte";
  column: string;
  value: unknown;
};

function projectProfile(row: FakeProfile | null, select: string): Record<string, unknown> | null {
  if (!row) return null;
  const fields = select.split(",").map((field) => field.trim()).filter(Boolean);
  return Object.fromEntries(fields.map((field) => [field, row[field as keyof FakeProfile]]));
}

function matchesFilters(row: FakeProfile, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const value = row[filter.column as keyof FakeProfile];
    if (filter.type === "eq") return value === filter.value;
    return Number(value) >= Number(filter.value);
  });
}

function fakeClient(flags: Record<string, unknown>, profile: FakeProfile | null) {
  return {
    from(table: string) {
      const state = { select: "", filters: [] as Filter[] };
      const query = {
        select(fields: string) {
          state.select = fields;
          return query;
        },
        eq(column: string, value: unknown) {
          state.filters.push({ type: "eq", column, value });
          return query;
        },
        gte(column: string, value: unknown) {
          state.filters.push({ type: "gte", column, value });
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          if (table === "app_config") {
            return { data: { value: flags }, error: null };
          }
          if (table === "external_commander_profiles") {
            const matched = profile && matchesFilters(profile, state.filters) ? profile : null;
            return { data: projectProfile(matched, state.select), error: null };
          }
          throw new Error(`unexpected table:${table}`);
        },
      };
      return query;
    },
  };
}

const baseProfile: FakeProfile = {
  commander_name: "Korvold, Fae-Cursed King",
  commander_name_norm: "korvold, fae-cursed king",
  approved_for_public: true,
  approved_sample_size: 64,
  confidence_score: 0.59,
  averages: { lands: 36.66, ramp: 12, draw: 9.4, removal: 7.8, protection: 2.2 },
  common_cards: Array.from({ length: 12 }, (_, index) => ({
    name: `Common Card ${index + 1}`,
    inclusion_rate: 0.9 - index * 0.03,
    deck_count: 999,
    raw_external_card_id: `raw-${index}`,
  })),
  last_refreshed_at: "2026-06-19T12:00:00.000Z",
  confidence_components: { sample: 1 },
  source_breakdown: { archidekt: 64 },
  profile_warnings: ["single_source_profile"],
  exclusion_reasons: ["qa_only_reason"],
  role_variance: { draw: 0.4 },
  support_gaps: [{ name: "Do Not Leak" }],
  raw_sample_size: 70,
};

const enabledFlags = { commander_page_community_profile_beta: true };

async function read(profile: FakeProfile | null, flags: Record<string, unknown> = enabledFlags) {
  return getCommanderPageCommunityProfile(
    "Korvold, Fae-Cursed King",
    fakeClient(flags, profile) as never
  );
}

async function run() {
  const result = await read(baseProfile, {});
  assert.strictEqual(result, null);

  const lowSample = await read({ ...baseProfile, approved_sample_size: 49 });
  assert.strictEqual(lowSample, null);

  const lowConfidence = await read({ ...baseProfile, confidence_score: 0.54 });
  assert.strictEqual(lowConfidence, null);

  const eligible = await read(baseProfile);
  assert(eligible);
  assert.deepStrictEqual(eligible, {
    commanderName: "Korvold, Fae-Cursed King",
    approvedSampleSize: 64,
    averages: { lands: 36.7, ramp: 12, draw: 9.4, removal: 7.8, protection: 2.2 },
    commonCards: Array.from({ length: 10 }, (_, index) => ({
      name: `Common Card ${index + 1}`,
      inclusionRate: Number((0.9 - index * 0.03).toFixed(2)),
    })),
    lastRefreshedAt: "2026-06-19T12:00:00.000Z",
  } satisfies CommanderPageCommunityProfile);

  const serialized = JSON.stringify(eligible);
  for (const forbidden of [
    "confidence_score",
    "confidence_components",
    "source_breakdown",
    "profile_warnings",
    "exclusion_reasons",
    "role_variance",
    "support_gaps",
    "raw_sample_size",
    "raw_external_card_id",
    "deck_count",
  ]) {
    assert(!serialized.includes(forbidden), `forbidden field leaked: ${forbidden}`);
  }
}

run()
  .then(() => {
    console.log("OK external-commander-page-profile");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
