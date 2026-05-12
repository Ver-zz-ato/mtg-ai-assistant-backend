import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const heavy = args.has("--heavy");
const jsonOnly = args.has("--json");
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const rateLimitRunOctet = Math.floor(Math.random() * 180) + 10;

function loadDotEnv(fileName) {
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

function compactText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(compactText).join("\n");
  if (typeof value === "object") return Object.values(value).map(compactText).join("\n");
  return String(value);
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

async function resolveBearerToken() {
  const email = process.env.AI_STRESS_EMAIL || process.env.DEV_LOGIN_EMAIL || "";
  const password = process.env.AI_STRESS_PASSWORD || process.env.DEV_LOGIN_PASSWORD || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!email || !password || !url || !anon) return null;
  try {
    const supabase = createClient(url, anon);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return null;
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

const commanderDeck =
  "Commander: Chatterfang, Squirrel General\n1 Chatterfang, Squirrel General\n1 Sol Ring\n1 Doubling Season\n1 Pitiless Plunderer\n1 Skullclamp\n1 Beast Within\n1 Forest\n1 Swamp";

const modernDeck =
  "4 Monastery Swiftspear\n4 Lightning Bolt\n4 Lava Spike\n4 Skewer the Critics\n4 Eidolon of the Great Revel\n18 Mountain\nSideboard\n3 Smash to Smithereens";

const pioneerDeck =
  "4 Monastery Swiftspear\n4 Play with Fire\n4 Kumano Faces Kakkazan\n4 Lightning Strike\n4 Mountain\n4 Ramunap Ruins\nSideboard\n3 Rending Volley";

const standardDeck =
  "4 Monastery Swiftspear\n4 Lightning Strike\n4 Monstrous Rage\n4 Mountain\n4 Inspiring Vantage\nSideboard\n3 Destroy Evil";

const pauperDeck =
  "4 Kessig Flamebreather\n4 Lightning Bolt\n4 Chain Lightning\n4 Skewer the Critics\n18 Mountain\nSideboard\n3 Smash to Smithereens";

const compareDeckB =
  "4 Dragon's Rage Channeler\n4 Lightning Bolt\n4 Mishra's Bauble\n4 Unholy Heat\n4 Ragavan, Nimble Pilferer\n18 Mountain\nSideboard\n3 Blood Moon";

const constructedForbidden = /\b(commander deck|commander format|edh|singleton|command zone|commander tax|color identity|slower pods|fast tables|pod politics)\b/i;
const promptLeak = /\b(as an ai language model|paste the answer|desired tone|word limit|must-keep|audience and goal)\b/i;

const coreTests = [
  {
    id: "suggestion-why-modern",
    route: "/api/deck/suggestion-why",
    body: { card: "Monastery Swiftspear", format: "Modern", deckText: modernDeck },
    mustNot: [constructedForbidden, promptLeak],
    must: [/swiftspear|prowess|curve|burn|spell/i],
  },
  {
    id: "suggestion-why-commander",
    route: "/api/deck/suggestion-why",
    body: {
      card: "Pitiless Plunderer",
      format: "Commander",
      commander: "Chatterfang, Squirrel General",
      deckText: commanderDeck,
    },
    must: [/chatterfang|token|squirrel|treasure|sacrifice/i],
    mustNot: [promptLeak],
  },
  {
    id: "swap-why-modern",
    route: "/api/deck/swap-why",
    body: { from: "Ragavan, Nimble Pilferer", to: "Monastery Swiftspear", format: "Modern", deckText: modernDeck },
    must: [/ragavan|swiftspear|curve|aggressive|burn|pressure/i],
    mustNot: [constructedForbidden, promptLeak],
  },
  {
    id: "swap-suggestions-commander",
    route: "/api/deck/swap-suggestions",
    body: { deckText: "1 Rhystic Study\n1 Cyclonic Rift\n1 Sol Ring", format: "Commander", commander: "Chatterfang, Squirrel General", currency: "USD", budget: 5 },
    mustNot: [promptLeak],
  },
  {
    id: "card-explain-eli5",
    route: "/api/mobile/card/explain",
    body: {
      mode: "eli5",
      card: {
        name: "Chatterfang, Squirrel General",
        oracleText:
          "Forestwalk\nIf one or more tokens would be created under your control, those tokens plus that many 1/1 green Squirrel creature tokens are created instead.\n{B}, Sacrifice X Squirrels: Target creature gets +X/-X until end of turn.",
        typeLine: "Legendary Creature - Squirrel Warrior",
        manaCost: "{2}{G}",
      },
    },
    must: [/token|squirrel/i],
    mustNot: [/price|banned|legal in/i, promptLeak],
  },
  {
    id: "mulligan-commander",
    route: "/api/mulligan/advice",
    body: {
      format: "commander",
      playDraw: "play",
      mulliganCount: 0,
      hand: ["Forest", "Swamp", "Sol Ring", "Chatterfang, Squirrel General", "Pitiless Plunderer", "Skullclamp", "Beast Within"],
      deck: {
        commander: "Chatterfang, Squirrel General",
        cards: [
          { name: "Forest", count: 10 },
          { name: "Swamp", count: 10 },
          { name: "Sol Ring", count: 1 },
          { name: "Chatterfang, Squirrel General", count: 1 },
          { name: "Pitiless Plunderer", count: 1 },
          { name: "Skullclamp", count: 1 },
          { name: "Beast Within", count: 1 },
        ],
      },
    },
    must: [/keep|mulligan/i],
    mustNot: [promptLeak],
  },
  {
    id: "mulligan-modern",
    route: "/api/mulligan/advice",
    body: {
      format: "modern",
      playDraw: "draw",
      mulliganCount: 0,
      hand: ["Mountain", "Mountain", "Monastery Swiftspear", "Lightning Bolt", "Lava Spike", "Skewer the Critics", "Eidolon of the Great Revel"],
      deck: {
        cards: [
          { name: "Mountain", count: 18 },
          { name: "Monastery Swiftspear", count: 4 },
          { name: "Lightning Bolt", count: 4 },
          { name: "Lava Spike", count: 4 },
          { name: "Skewer the Critics", count: 4 },
        ],
      },
    },
    must: [/keep|mulligan/i],
    mustNot: [constructedForbidden, promptLeak],
  },
  {
    id: "deck-roast-modern",
    route: "/api/deck/roast",
    body: { format: "Modern", savageness: 4, deckText: modernDeck },
    must: [/\[\[[^\]]+\]\]/],
    mustNot: [/\{\{[^}]+\}\}/, constructedForbidden, promptLeak],
  },
  {
    id: "mobile-roast-pauper",
    route: "/api/mobile/deck/roast-ai",
    body: { format: "Pauper", heat: "medium", deckText: pauperDeck },
    must: [/pauper|burn|damage|spell|mountain|red/i],
    mustNot: [constructedForbidden, promptLeak],
  },
  {
    id: "playstyle-standard",
    route: "/api/playstyle/explain",
    body: {
      level: "short",
      format: "Standard",
      profileLabel: "Tempo Pilot",
      traits: { control: 65, aggression: 55, comboAppetite: 20, varianceTolerance: 35, interactionPref: 80, gameLengthPref: 45, budgetElasticity: 40 },
      topArchetypes: [{ label: "Tempo", matchPct: 88 }],
      avoidList: [],
    },
    must: [/tempo|interactive|control|aggression/i],
    mustNot: [constructedForbidden, promptLeak],
  },
  {
    id: "finish-suggestions-pioneer",
    route: "/api/deck/finish-suggestions",
    body: { format: "Pioneer", deckText: pioneerDeck, maxSuggestions: 3, budget: "budget" },
    must: [/pioneer|mainboard|legal|suggestions|card|role/i],
    mustNot: [constructedForbidden, promptLeak],
  },
];

const heavyTests = [
  {
    id: "mobile-compare-modern",
    route: "/api/mobile/deck/compare-ai",
    auth: true,
    body: {
      format: "Modern",
      decks: `Deck A\n${modernDeck}\n\nDeck B\n${compareDeckB}`,
      comparison: {
        sharedCards: ["Lightning Bolt"],
        uniqueToDecks: [
          { deckIndex: 0, cards: ["Monastery Swiftspear"] },
          { deckIndex: 1, cards: ["Dragon's Rage Channeler"] },
        ],
      },
    },
    must: [/Fast games|Grindier games|more_consistent|one_line_verdict/i],
    mustNot: [/slower pods|fast tables|commander deck|edh/i, promptLeak],
  },
  {
    id: "generate-constructed-pauper",
    route: "/api/deck/generate-constructed",
    auth: true,
    body: {
      format: "Pauper",
      colors: ["R"],
      archetype: "burn",
      budget: "budget",
      powerLevel: "casual",
      notes: "Make a simple mono-red burn deck. Avoid Commander concepts.",
    },
    must: [/Pauper|Mainboard|Sideboard|60|15/i],
    mustNot: [constructedForbidden, promptLeak],
  },
  {
    id: "mobile-analyze-standard",
    route: "/api/mobile/deck/analyze",
    body: { format: "Standard", deckText: standardDeck },
    must: [/standard|score|suggestions|analysis|quick/i],
    mustNot: [constructedForbidden, promptLeak],
  },
  {
    id: "deck-analyze-modern",
    route: "/api/deck/analyze",
    body: { format: "Modern", deckText: modernDeck },
    must: [/modern|suggestions|score|quick|fix|analysis/i],
    mustNot: [constructedForbidden, promptLeak],
  },
];

async function requestJson(test, bearerToken, index) {
  const guestToken = `ai-route-stress-${Date.now()}-${index}-${crypto.randomUUID()}`;
  const headers = {
    "content-type": "application/json",
    "user-agent": "manatap-ai-route-stress/1.0",
    "x-forwarded-for": `198.51.${rateLimitRunOctet}.${(index % 200) + 10}`,
  };
  const authAll = process.env.AI_STRESS_AUTH_ALL === "1";
  if ((test.auth || authAll) && bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  if (!headers.authorization) {
    headers["x-guest-session-token"] = guestToken;
    headers.cookie = `guest_session_token=${guestToken}`;
  }

  const started = Date.now();
  const res = await fetch(`${baseUrl}${test.route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(test.body),
  });
  const elapsedMs = Date.now() - started;
  const raw = await res.text();
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    json = { raw };
  }
  return { status: res.status, elapsedMs, json };
}

async function pingServer() {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { headers: { "user-agent": "manatap-ai-route-stress/1.0" } });
    return res.ok;
  } catch {
    return false;
  }
}

function evaluate(test, response) {
  const text = compactText(response.json);
  const failures = [];
  if (response.status < 200 || response.status >= 300) {
    failures.push(`HTTP ${response.status}`);
  }
  if (response.json?.ok === false) {
    failures.push(`api ok=false: ${response.json.error || response.json.code || "unknown error"}`);
  }
  if (test.must && !hasAll(text, test.must)) {
    failures.push(`missing required pattern: ${test.must.map(String).join(", ")}`);
  }
  if (test.mustNot && hasAny(text, test.mustNot)) {
    failures.push(`matched forbidden pattern: ${test.mustNot.map(String).join(", ")}`);
  }
  return {
    id: test.id,
    route: test.route,
    status: response.status,
    elapsedMs: response.elapsedMs,
    ok: failures.length === 0,
    failures,
    snippet: text.replace(/\s+/g, " ").slice(0, 500),
  };
}

const serverOk = await pingServer();
if (!serverOk) {
  console.error(`AI route stress test cannot reach ${baseUrl}/api/health. Start the app or set BASE_URL.`);
  process.exit(2);
}

const bearerToken = await resolveBearerToken();
const tests = [...coreTests, ...(heavy ? heavyTests : [])];
const results = [];

for (const [index, test] of tests.entries()) {
  if (test.auth && !bearerToken) {
    results.push({
      id: test.id,
      route: test.route,
      status: 0,
      elapsedMs: 0,
      ok: true,
      skipped: true,
      failures: [],
      snippet: "Skipped: auth credentials unavailable.",
    });
    continue;
  }
  try {
    const response = await requestJson(test, bearerToken, index);
    results.push(evaluate(test, response));
  } catch (error) {
    results.push({
      id: test.id,
      route: test.route,
      status: 0,
      elapsedMs: 0,
      ok: false,
      failures: [error instanceof Error ? error.message : String(error)],
      snippet: "",
    });
  }
}

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
const summary = {
  baseUrl,
  heavy,
  total: results.length,
  passed: results.length - failed.length - skipped.length,
  skipped: skipped.length,
  failed: failed.length,
  results,
};

if (jsonOnly) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`AI route stress test against ${baseUrl}`);
  console.log(`Mode: ${heavy ? "heavy" : "core"} | Passed: ${summary.passed} | Skipped: ${summary.skipped} | Failed: ${summary.failed}`);
  for (const result of results) {
    const marker = result.skipped ? "SKIP" : result.ok ? "PASS" : "FAIL";
    console.log(`\n[${marker}] ${result.id} ${result.route} ${result.status ? `(${result.status}, ${result.elapsedMs}ms)` : ""}`);
    if (result.failures.length) {
      for (const failure of result.failures) console.log(`  - ${failure}`);
    }
    if (result.snippet) console.log(`  ${result.snippet}`);
  }
}

process.exit(failed.length > 0 ? 1 : 0);
