import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { evaluateCardRecommendationLegality, banNormSetForUserFormat } from "@/lib/deck/recommendation-legality";
import { bannedDataToMaps, getBannedCards } from "@/lib/data/get-banned-cards";
import { buildTagProfile, fetchTagGroundedRowsByNames } from "@/lib/recommendations/tag-grounding";

type CommanderScenario = {
  id: string;
  body: Record<string, unknown>;
  expected: string[];
};

function loadDotEnv(fileName: string) {
  const file = path.join(process.cwd(), fileName);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

const baseUrl = (process.env.BASE_URL || "https://www.manatap.ai").replace(/\/$/, "");

function compactText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase();
  if (Array.isArray(value)) return value.map(compactText).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(compactText).join(" ");
  return String(value).toLowerCase();
}

function assertThat(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchCommanderRecommendationsLive(scenario: CommanderScenario) {
  const res = await fetch(`${baseUrl}/api/mobile/commander-recommendations`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "manatap-recommendation-verify/1.0" },
    body: JSON.stringify(scenario.body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(`mobile commander route failed for ${scenario.id}: HTTP ${res.status}`);
  }
  return json.recommendations as Array<{
    name: string;
    description: string;
    archetype: string;
    fitReason: string;
    colorIdentity?: string[];
  }>;
}

async function verifyCommanderLegalityAndTags(
  admin: Awaited<ReturnType<typeof getAdminClient>>,
  formatLabel: string,
  names: string[],
) {
  if (!admin || names.length === 0) return { legalCount: 0, tagCoverage: 0 };
  const rows = await fetchTagGroundedRowsByNames(admin, names);
  const tagProfile = buildTagProfile(rows);
  const bannedMaps = bannedDataToMaps(await getBannedCards());
  const banNormSet = banNormSetForUserFormat(bannedMaps, formatLabel);
  let legalCount = 0;
  let tagCoverage = 0;

  for (const row of rows) {
    const evalRes = evaluateCardRecommendationLegality(row, normalizeScryfallCacheName(row.name), formatLabel, banNormSet);
    if (evalRes.allowed) legalCount += 1;
    if ((row.theme_tags?.length ?? 0) + (row.gameplay_tags?.length ?? 0) + (row.archetype_tags?.length ?? 0) > 0) tagCoverage += 1;
  }

  assertThat(tagProfile.topThemeTags.length > 0 || tagProfile.topGameplayTags.length > 0, "tag profile should not be empty for recommendation rows");
  return { legalCount, tagCoverage };
}

async function verifyTagCache(admin: Awaited<ReturnType<typeof getAdminClient>>) {
  if (!admin) return { skipped: true };
  const { count: totalRows } = await admin.from("card_tag_cache").select("*", { count: "exact", head: true });
  const { count: commanderRows } = await admin.from("card_tag_cache").select("*", { count: "exact", head: true }).eq("commander_eligible", true);
  assertThat((totalRows ?? 0) > 30000, "card_tag_cache should be populated");
  assertThat((commanderRows ?? 0) > 3000, "commander_eligible tag rows should be populated");

  const sampleNames = ["Prosper, Tome-Bound", "Atraxa, Praetors' Voice", "Giada, Font of Hope"];
  const rows = await fetchTagGroundedRowsByNames(admin, sampleNames);
  assertThat(rows.length >= 2, "expected sample tag rows to resolve");
  for (const row of rows) {
    assertThat((row.theme_tags?.length ?? 0) + (row.gameplay_tags?.length ?? 0) > 0, `expected enriched tags on ${row.name}`);
  }
  return { totalRows, commanderRows };
}

async function verifyPublicRoutes() {
  const scenarios: CommanderScenario[] = [
    {
      id: "tokens",
      body: {
        format: "Commander",
        answers: { theme: "tokens", pace: "aggro", interaction: "moderate", complexity: "simple", budget: "budget" },
        traits: { aggression: 75, control: 25, comboAppetite: 20, interactionPref: 45, gameLengthPref: 40, budgetElasticity: 25 },
        powerLevel: "Casual",
        budget: "Budget",
        vibe: "tokens go wide treasure",
        limit: 6,
      },
      expected: ["token", "go wide", "treasure", "swarm"],
    },
    {
      id: "graveyard",
      body: {
        format: "Commander",
        answers: { theme: "graveyard", pace: "value", interaction: "heavy", complexity: "complex", budget: "moderate" },
        traits: { aggression: 20, control: 70, comboAppetite: 55, interactionPref: 80, gameLengthPref: 70, budgetElasticity: 55 },
        powerLevel: "Focused",
        budget: "Moderate",
        vibe: "graveyard recursion reanimator aristocrats",
        limit: 6,
      },
      expected: ["graveyard", "recursion", "reanimator", "aristocrats"],
    },
    {
      id: "spellslinger",
      body: {
        format: "Commander",
        answers: { theme: "spells", pace: "combo", interaction: "heavy", complexity: "complex", budget: "high" },
        traits: { aggression: 35, control: 60, comboAppetite: 85, interactionPref: 70, gameLengthPref: 50, budgetElasticity: 80 },
        powerLevel: "Optimized",
        budget: "High",
        vibe: "spellslinger storm copy spells",
        limit: 6,
      },
      expected: ["spell", "spellslinger", "storm", "copy"],
    },
  ];

  const admin = await getAdminClient();
  const tagCacheStatus = await verifyTagCache(admin);
  const routeFindings: Array<Record<string, unknown>> = [];
  const failures: string[] = [];

  for (const scenario of scenarios) {
    const results = await fetchCommanderRecommendationsLive(scenario);
    if (results.length < 6) failures.push(`${scenario.id}: expected at least 6 recommendations`);
    const combined = compactText(results.map((row) => `${row.description} ${row.fitReason} ${row.archetype}`));
    if (!scenario.expected.some((needle) => combined.includes(needle))) {
      failures.push(`${scenario.id}: recommendations do not look grounded in expected theme keywords`);
    }
    const uniqueNames = new Set(results.map((row) => row.name));
    const uniqueReasons = new Set(results.map((row) => row.fitReason));
    if (uniqueNames.size < 5) failures.push(`${scenario.id}: recommendations are not varied enough`);
    if (uniqueReasons.size < 2) failures.push(`${scenario.id}: fit reasons are too repetitive`);

    const legalityCheck = await verifyCommanderLegalityAndTags(admin, "Commander", results.map((row) => row.name));
    if (legalityCheck.legalCount !== results.length) failures.push(`${scenario.id}: one or more recommendations are not Commander legal`);
    if (legalityCheck.tagCoverage !== results.length) failures.push(`${scenario.id}: one or more recommendations are missing tag coverage`);

    routeFindings.push({
      scenario: scenario.id,
      count: results.length,
      legalCount: legalityCheck.legalCount,
      tagCoverage: legalityCheck.tagCoverage,
      uniqueNames: uniqueNames.size,
      uniqueReasons: uniqueReasons.size,
      preview: results.slice(0, 3).map((row) => ({
        name: row.name,
        fitReason: row.fitReason,
        description: row.description,
      })),
    });
  }

  return {
    baseUrl,
    tagCacheStatus,
    commanderRoute: routeFindings,
    failures,
    notes: [
      "Public live verification currently covers the mobile commander recommendations route end-to-end.",
      "Authenticated recommendation routes are covered through backend unit checks and helper-level legality/tag validation in this run.",
    ],
  };
}

verifyPublicRoutes()
  .then((result) => {
    const ok = result.failures.length === 0;
    console.log(JSON.stringify({ ok, result }, null, 2));
    if (!ok) process.exit(1);
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exit(1);
  });
