import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { SAMPLE_DECKS } from "../lib/sample-decks";
import { buildGenerationPreviewFacts } from "../lib/deck/generation-preview-facts";
import { parseDeckText } from "../lib/deck/parseDeckText";
import { aggregateCards, norm, totalDeckQty } from "../lib/deck/generation-helpers";
import { getFormatRules, isCommanderFormatString, tryDeckFormatStringToAnalyzeFormat } from "../lib/deck/formatRules";
import { getDetailsForNamesCached } from "../lib/server/scryfallCache";
import { isWithinColorIdentity } from "../lib/deck/mtgValidators";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const docsDir = path.resolve(projectRoot, "docs");
const reportPath = path.join(docsDir, "AI_WORKSHOP_EVAL_REPORT.md");
const jsonPath = path.join(projectRoot, "ai-workshop-eval-results.json");

function loadDotEnv(fileName: string) {
  const file = path.join(projectRoot, fileName);
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

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const jsonOnly = process.argv.includes("--json");

type AnalyzeFormat = "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper";
type TransformIntent =
  | "general"
  | "improve_mana_base"
  | "tighten_curve"
  | "add_interaction"
  | "lower_budget"
  | "more_casual"
  | "more_optimized"
  | "fix_legality";

type DeckFixture = {
  id: string;
  title: string;
  format: AnalyzeFormat;
  commander: string | null;
  deckText: string;
  expectation?: "legal_noop" | "size_review_only" | "offcolor_repair" | "duplicate_repair";
  source?: string;
};

type EvalCase = {
  fixture: DeckFixture;
  intent: TransformIntent;
  powerLevel: string;
  budget: string;
};

type EvalResult = {
  fixtureId: string;
  fixtureTitle: string;
  fixtureFormat: AnalyzeFormat;
  fixtureSource: string;
  intent: TransformIntent;
  status: number;
  elapsedMs: number;
  ok: boolean;
  severity: "pass" | "warn" | "fail";
  added: string[];
  removed: string[];
  warnings: string[];
  issues: string[];
  summary: string;
  baselineFacts?: Awaited<ReturnType<typeof buildGenerationPreviewFacts>>;
  resultFacts?: Awaited<ReturnType<typeof buildGenerationPreviewFacts>>;
  finalCount?: number;
};

const expensiveCardHints = [
  /mana crypt/i,
  /jeweled lotus/i,
  /the one ring/i,
  /gaea's cradle/i,
  /dockside extortionist/i,
  /rhystic study/i,
  /smothering tithe/i,
  /fierce guardianship/i,
  /vampiric tutor/i,
  /demonic tutor/i,
  /cyclonic rift/i,
];

function compactText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(compactText).join("\n");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(compactText).join("\n");
  return String(value);
}

async function resolveBearerToken() {
  const email = process.env.AI_STRESS_EMAIL || process.env.DEV_LOGIN_EMAIL || "";
  const password = process.env.AI_STRESS_PASSWORD || process.env.DEV_LOGIN_PASSWORD || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!email || !password || !url || !anon) return null;
  const supabase = createClient(url, anon);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return null;
  return data.session?.access_token || null;
}

async function pingServer() {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { headers: { "user-agent": "ai-workshop-eval/1.0" } });
    return res.ok;
  } catch {
    return false;
  }
}

function sanitizeDeckText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .trim();
}

function makeConstructedFixtures(): DeckFixture[] {
  return [
    {
      id: "modern-burn",
      title: "Modern Burn",
      format: "Modern",
      commander: null,
      source: "verify-ai-route-responses",
      expectation: "legal_noop",
      deckText: sanitizeDeckText(`
4 Monastery Swiftspear
4 Lightning Bolt
4 Lava Spike
4 Skewer the Critics
4 Eidolon of the Great Revel
4 Rift Bolt
4 Boros Charm
4 Searing Blaze
4 Goblin Guide
4 Roiling Vortex
4 Mountain
4 Inspiring Vantage
4 Sunbaked Canyon
4 Sacred Foundry
4 Wooded Foothills
      `),
    },
    {
      id: "pioneer-red",
      title: "Pioneer Mono-Red",
      format: "Pioneer",
      commander: null,
      source: "verify-ai-route-responses",
      expectation: "legal_noop",
      deckText: sanitizeDeckText(`
4 Monastery Swiftspear
4 Play with Fire
4 Kumano Faces Kakkazan
4 Lightning Strike
4 Monstrous Rage
4 Slickshot Show-Off
4 Soul-Scar Mage
4 Wizard's Lightning
4 Bonecrusher Giant
4 Chandra, Dressed to Kill
20 Mountain
      `),
    },
    {
      id: "standard-boros",
      title: "Standard Boros Aggro",
      format: "Standard",
      commander: null,
      source: "internal-fixture",
      expectation: "legal_noop",
      deckText: sanitizeDeckText(`
4 Monastery Swiftspear
4 Lightning Helix
4 Play with Fire
4 Monstrous Rage
4 Warden of the Inner Sky
4 Imodane's Recruiter
4 Resolute Reinforcements
4 Gleeful Demolition
4 Novice Inspector
4 Case of the Gateway Express
8 Mountain
8 Plains
4 Battlefield Forge
4 Inspiring Vantage
      `),
    },
    {
      id: "pauper-burn",
      title: "Pauper Burn",
      format: "Pauper",
      commander: null,
      source: "verify-ai-route-responses",
      expectation: "legal_noop",
      deckText: sanitizeDeckText(`
4 Kessig Flamebreather
4 Lightning Bolt
4 Chain Lightning
4 Skewer the Critics
4 Lava Spike
4 Rift Bolt
4 Reckless Impulse
4 Experimental Synthesizer
4 Voldaren Epicure
4 End the Festivities
20 Mountain
      `),
    },
  ];
}

function withMissingOneCard(sample: DeckFixture): DeckFixture {
  const lines = sanitizeDeckText(sample.deckText).split(/\r?\n/);
  const idx = lines.findIndex((line) => /^1\s+/i.test(line));
  const next = [...lines];
  if (idx >= 0) next.splice(idx, 1);
  return {
    ...sample,
    id: `${sample.id}-99`,
    title: `${sample.title} (99-card review)`,
    deckText: next.join("\n"),
    expectation: "size_review_only",
    source: `${sample.source ?? "sample"} + missing-one`,
  };
}

function withOffColorRepair(sample: DeckFixture): DeckFixture {
  const lines = sanitizeDeckText(sample.deckText).split(/\r?\n/);
  const idx = lines.findIndex((line) => /^1\s+Forest$/i.test(line) || /^1\s+Island$/i.test(line) || /^1\s+Swamp$/i.test(line));
  const next = [...lines];
  if (idx >= 0) next[idx] = "1 Lightning Bolt";
  return {
    ...sample,
    id: `${sample.id}-offcolor`,
    title: `${sample.title} (off-color repair)`,
    deckText: next.join("\n"),
    expectation: "offcolor_repair",
    source: `${sample.source ?? "sample"} + off-color`,
  };
}

function withDuplicateRepair(sample: DeckFixture): DeckFixture {
  const lines = sanitizeDeckText(sample.deckText).split(/\r?\n/);
  const next = [...lines];
  const solRingIdx = next.findIndex((line) => /^1\s+Sol Ring$/i.test(line));
  const basicIdx = next.findIndex((line) => /^1\s+(Forest|Island|Swamp|Mountain|Plains)$/i.test(line));
  if (solRingIdx >= 0 && basicIdx >= 0) next[basicIdx] = "1 Sol Ring";
  return {
    ...sample,
    id: `${sample.id}-duplicate`,
    title: `${sample.title} (duplicate repair)`,
    deckText: next.join("\n"),
    expectation: "duplicate_repair",
    source: `${sample.source ?? "sample"} + duplicate`,
  };
}

async function fetchPreconFixtures(): Promise<DeckFixture[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !serviceRole) return [];
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("precon_decks")
    .select("id, name, commander, format, deck_text")
    .order("release_year", { ascending: false, nullsFirst: false })
    .limit(2);
  if (error || !data?.length) return [];
  return data
    .filter((row) => typeof row.deck_text === "string" && row.deck_text.trim().length > 100)
    .map((row) => ({
      id: `precon-${row.id}`,
      title: row.name,
      format: "Commander" as const,
      commander: row.commander,
      deckText: row.deck_text,
      expectation: "legal_noop" as const,
      source: "precon_decks",
    }));
}

function buildCommanderFixtures(): DeckFixture[] {
  return SAMPLE_DECKS.map((deck) => ({
    id: deck.id,
    title: deck.name,
    format: "Commander" as const,
    commander: deck.commander,
    deckText: deck.deckList,
    expectation: "legal_noop" as const,
    source: "sample-decks",
  }));
}

async function requestTransform(test: EvalCase, bearerToken: string) {
  const body = {
    sourceDeckText: test.fixture.deckText,
    format: test.fixture.format,
    commander: test.fixture.commander,
    transformIntent: test.intent,
    powerLevel: test.powerLevel,
    budget: test.budget,
  };
  const started = Date.now();
  const res = await fetch(`${baseUrl}/api/deck/transform`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "ai-workshop-eval/1.0",
      authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - started;
  const raw = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = { raw };
  }
  return { status: res.status, elapsedMs, json };
}

function normalizeDeckRows(text: string): Array<{ name: string; qty: number }> {
  return aggregateCards(parseDeckText(text));
}

function diffDeckRows(beforeText: string, afterText: string) {
  const before = new Map(normalizeDeckRows(beforeText).map((row) => [norm(row.name), row.qty]));
  const afterRows = normalizeDeckRows(afterText);
  const after = new Map(afterRows.map((row) => [norm(row.name), row.qty]));
  const nameByKey = new Map<string, string>();
  for (const row of normalizeDeckRows(beforeText)) nameByKey.set(norm(row.name), row.name);
  for (const row of afterRows) nameByKey.set(norm(row.name), row.name);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const added: string[] = [];
  const removed: string[] = [];
  for (const key of keys) {
    const b = before.get(key) ?? 0;
    const a = after.get(key) ?? 0;
    if (a > b) added.push(nameByKey.get(key) ?? key);
    if (b > a) removed.push(nameByKey.get(key) ?? key);
  }
  return { added, removed };
}

async function findCommanderOffColorNames(deckText: string, commander: string | null) {
  if (!commander) return [];
  const colors = (await import("../lib/deck/generation-helpers")).getCommanderColorIdentity
    ? await (await import("../lib/deck/generation-helpers")).getCommanderColorIdentity(commander)
    : [];
  const allowed = colors.map((c: string) => c.toUpperCase());
  const rows = normalizeDeckRows(deckText);
  const details = await getDetailsForNamesCached(rows.map((row) => row.name));
  const offenders: string[] = [];
  for (const row of rows) {
    const detail = details.get(norm(row.name));
    if (!detail) continue;
    if (!isWithinColorIdentity(detail as any, allowed)) offenders.push(row.name);
  }
  return offenders;
}

function summarizeCounts(added: string[], removed: string[], warnings: string[]) {
  return `${added.length} adds · ${removed.length} cuts · ${warnings.length} notes`;
}

function heuristicIssues(
  test: EvalCase,
  response: any,
  baselineFacts: Awaited<ReturnType<typeof buildGenerationPreviewFacts>> | undefined,
  resultFacts: Awaited<ReturnType<typeof buildGenerationPreviewFacts>> | undefined,
  added: string[],
  removed: string[],
  finalCount: number,
  offColorNames: string[],
): { severity: "pass" | "warn" | "fail"; issues: string[] } {
  const issues: string[] = [];
  const expectation = test.fixture.expectation;
  const rules = getFormatRules(test.fixture.format);
  const summary = compactText(response.summary);
  const warningText = compactText(response.warnings);

  if (response.ok === false) issues.push(`api returned ok=false: ${response.error || response.code || "unknown"}`);
  if (!response.deckText) issues.push("missing deckText in response");
  if (test.fixture.format === "Commander" && offColorNames.length > 0) {
    issues.push(`output still contains off-color cards: ${offColorNames.slice(0, 5).join(", ")}`);
  }

  if (expectation === "legal_noop" && test.intent === "fix_legality") {
    if (added.length > 0 || removed.length > 0) issues.push("legal deck should not change under fix_legality");
    if (!/no legality changes needed/i.test(summary) && !/already passes current/i.test(summary)) {
      issues.push("legal no-op summary missing explicit no-change wording");
    }
  }

  if (expectation === "size_review_only" && test.intent === "fix_legality") {
    if (added.length > 0 || removed.length > 0) issues.push("size-only review should not propose adds or cuts");
    if (!/deck size needs review/i.test(summary) && !/cards after validation/i.test(warningText)) {
      issues.push("size-only review missing deck-size warning");
    }
  }

  if (expectation === "offcolor_repair" && test.intent === "fix_legality" && removed.length === 0) {
    issues.push("off-color repair should remove at least one card");
  }

  if (expectation === "duplicate_repair" && test.intent === "fix_legality" && removed.length === 0) {
    issues.push("duplicate repair should remove at least one card");
  }

  if (test.intent !== "fix_legality") {
    if (added.length === 0 && removed.length === 0) issues.push(`${test.intent} returned no visible changes`);
    if (finalCount !== rules.mainDeckTarget) {
      issues.push(`result card count ${finalCount}/${rules.mainDeckTarget}`);
    }
    if (test.intent === "tighten_curve" && baselineFacts?.avg_cmc != null && resultFacts?.avg_cmc != null) {
      if (resultFacts.avg_cmc > baselineFacts.avg_cmc + 0.1) issues.push("curve pass increased avg CMC");
    }
    if (test.intent === "add_interaction" && baselineFacts && resultFacts) {
      if (resultFacts.interaction_count < baselineFacts.interaction_count + 1) {
        issues.push("interaction pass did not improve interaction count");
      }
    }
    if (test.intent === "improve_mana_base" && baselineFacts && resultFacts) {
      if (resultFacts.land_count < baselineFacts.land_count - 2 && resultFacts.ramp_count <= baselineFacts.ramp_count) {
        issues.push("mana base pass reduced lands without improving ramp");
      }
    }
    if (test.intent === "lower_budget" && added.some((name) => expensiveCardHints.some((re) => re.test(name)))) {
      issues.push("budget pass added premium / expensive card(s)");
    }
    if (test.intent === "more_casual" && added.some((name) => /mana crypt|jeweled lotus|ad nauseam/i.test(name))) {
      issues.push("casual pass added cEDH-leaning card(s)");
    }
  }

  const severity: "pass" | "warn" | "fail" =
    issues.length === 0 ? "pass" : issues.some((issue) => /missing deckText|output still contains off-color|legal deck should not change|should remove at least one|increased avg CMC|did not improve interaction count|reduced lands without improving ramp|result card count/i.test(issue)) ? "fail" : "warn";
  return { severity, issues };
}

function buildEvalCases(fixtures: DeckFixture[]): EvalCase[] {
  const legalityCases: EvalCase[] = fixtures.map((fixture) => ({
    fixture,
    intent: "fix_legality",
    powerLevel: fixture.format === "Commander" ? "Casual" : "Mid",
    budget: "Moderate",
  }));

  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const representativeIds = [
    "atraxa-superfriends",
    "yuriko-ninjas",
    "lathril-elves",
    "modern-burn",
    "standard-boros",
  ];
  const transformIntents: TransformIntent[] = [
    "general",
    "improve_mana_base",
    "tighten_curve",
    "add_interaction",
    "lower_budget",
    "more_casual",
    "more_optimized",
  ];
  const nonLegalityCases: EvalCase[] = [];
  for (const id of representativeIds) {
    const fixture = byId.get(id);
    if (!fixture) continue;
    for (const intent of transformIntents) {
      nonLegalityCases.push({
        fixture,
        intent,
        powerLevel: fixture.format === "Commander" ? "Focused" : "Mid",
        budget: intent === "lower_budget" ? "Budget" : "Moderate",
      });
    }
  }

  return [...legalityCases, ...nonLegalityCases];
}

function renderMarkdown(results: EvalResult[]) {
  const total = results.length;
  const pass = results.filter((r) => r.severity === "pass").length;
  const warn = results.filter((r) => r.severity === "warn").length;
  const fail = results.filter((r) => r.severity === "fail").length;
  const sections = [
    `# AI Workshop Eval Report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Base URL: ${baseUrl}`,
    ``,
    `## Summary`,
    ``,
    `- Total eval cases: ${total}`,
    `- Pass: ${pass}`,
    `- Warn: ${warn}`,
    `- Fail: ${fail}`,
    ``,
    `## Failures`,
    ``,
  ];

  const interesting = [...results].filter((r) => r.severity !== "pass").sort((a, b) => a.severity.localeCompare(b.severity));
  if (interesting.length === 0) sections.push(`No warnings or failures.`);
  for (const result of interesting) {
    sections.push(
      `### ${result.fixtureTitle} — ${result.intent}`,
      ``,
      `- Severity: ${result.severity}`,
      `- Format: ${result.fixtureFormat}`,
      `- Source: ${result.fixtureSource}`,
      `- Time: ${result.elapsedMs}ms`,
      `- Summary: ${result.summary || "—"}`,
      `- Changes: ${summarizeCounts(result.added, result.removed, result.warnings)}`,
      `- Issues:`,
      ...result.issues.map((issue) => `  - ${issue}`),
      result.added.length ? `- Added: ${result.added.slice(0, 8).join(", ")}` : `- Added: none`,
      result.removed.length ? `- Removed: ${result.removed.slice(0, 8).join(", ")}` : `- Removed: none`,
      result.warnings.length ? `- Warnings: ${result.warnings.join(" | ")}` : `- Warnings: none`,
      ``,
    );
  }

  return sections.join("\n");
}

async function main() {
  const serverOk = await pingServer();
  if (!serverOk) {
    throw new Error(`Cannot reach ${baseUrl}/api/health. Start the local server or set BASE_URL.`);
  }

  const bearerToken = await resolveBearerToken();
  if (!bearerToken) {
    throw new Error("Could not resolve a bearer token from DEV_LOGIN_* / AI_STRESS_* env.");
  }

  const commanderFixtures = buildCommanderFixtures();
  const specialFixtures = [
    withMissingOneCard(commanderFixtures[0]),
    withOffColorRepair(commanderFixtures[9] ?? commanderFixtures[0]),
    withDuplicateRepair(commanderFixtures[1] ?? commanderFixtures[0]),
  ];
  const fixtures = [...commanderFixtures, ...makeConstructedFixtures(), ...specialFixtures, ...(await fetchPreconFixtures())];
  const cases = buildEvalCases(fixtures);

  const results: EvalResult[] = [];
  for (const test of cases) {
    const response = await requestTransform(test, bearerToken);
    const warnings = Array.isArray(response.json?.warnings) ? response.json.warnings.map(String) : [];
    const deckText = String(response.json?.deckText || "");
    const { added, removed } = deckText ? diffDeckRows(test.fixture.deckText, deckText) : { added: [], removed: [] };
    const baselineFacts = await buildGenerationPreviewFacts(
      test.fixture.deckText,
      test.fixture.commander,
      test.fixture.format,
    ).catch(() => undefined);
    const resultFacts = deckText
      ? await buildGenerationPreviewFacts(deckText, test.fixture.commander, test.fixture.format).catch(() => undefined)
      : undefined;
    const finalCount = deckText ? totalDeckQty(normalizeDeckRows(deckText)) : undefined;
    const offColorNames =
      test.fixture.format === "Commander" && deckText
        ? await findCommanderOffColorNames(deckText, test.fixture.commander)
        : [];
    const heuristic = heuristicIssues(test, response.json, baselineFacts, resultFacts, added, removed, finalCount ?? 0, offColorNames);

    results.push({
      fixtureId: test.fixture.id,
      fixtureTitle: test.fixture.title,
      fixtureFormat: test.fixture.format,
      fixtureSource: test.fixture.source ?? "fixture",
      intent: test.intent,
      status: response.status,
      elapsedMs: response.elapsedMs,
      ok: response.status >= 200 && response.status < 300 && response.json?.ok !== false,
      severity: heuristic.severity,
      added,
      removed,
      warnings,
      issues: heuristic.issues,
      summary: String(response.json?.summary || ""),
      baselineFacts,
      resultFacts,
      finalCount,
    });
  }

  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(reportPath, renderMarkdown(results), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, results }, null, 2), "utf8");

  const output = {
    ok: results.every((r) => r.severity !== "fail"),
    total: results.length,
    pass: results.filter((r) => r.severity === "pass").length,
    warn: results.filter((r) => r.severity === "warn").length,
    fail: results.filter((r) => r.severity === "fail").length,
    reportPath,
    jsonPath,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(output));
  } else {
    console.log(JSON.stringify(output, null, 2));
    console.log(`Report written to ${reportPath}`);
  }

  if (!output.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
