#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

function loadEnvFile(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const DEFAULT_OUTPUT = `tmp/chat-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.CHAT_AUDIT_BASE_URL || "http://localhost:3000",
    output: process.env.CHAT_AUDIT_OUTPUT || DEFAULT_OUTPUT,
    delayMs: Number(process.env.CHAT_AUDIT_DELAY_MS || 500),
    requestTimeoutMs: Number(process.env.CHAT_AUDIT_REQUEST_TIMEOUT_MS || 180000),
    includeLiveOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base-url") opts.baseUrl = argv[++i] || opts.baseUrl;
    else if (arg === "--output") opts.output = argv[++i] || opts.output;
    else if (arg === "--delay") opts.delayMs = Number(argv[++i] || opts.delayMs);
    else if (arg === "--request-timeout") opts.requestTimeoutMs = Number(argv[++i] || opts.requestTimeoutMs);
    else if (arg === "--live") opts.baseUrl = "https://www.manatap.ai";
  }
  opts.baseUrl = opts.baseUrl.replace(/\/$/, "");
  return opts;
}

const opts = parseArgs(process.argv);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const FREE_EMAIL = process.env.CHAT_AUDIT_FREE_EMAIL || "";
const FREE_PASSWORD = process.env.CHAT_AUDIT_FREE_PASSWORD || "";
const PRO_EMAIL = process.env.CHAT_AUDIT_PRO_EMAIL || "";
const PRO_PASSWORD = process.env.CHAT_AUDIT_PRO_PASSWORD || "";

const GLOBAL_FORBIDDEN = [
  /\[DONE\]/i,
  /__MANATAP_/i,
  /\bI couldn't resolve\b/i,
  /\bI could not resolve\b/i,
  /\bcustom\/homebrew\b/i,
  /\bclosest workflow\b/i,
  /\bcorrected answer\b/i,
  /\byour answer is solid\b/i,
];

const AlelaDeck = `analyse this Commander deck and give specific fixes:
1 Maralen, Fae Ascendant
1 Alela, Cunning Conqueror
1 Alchemist's Refuge
1 Arcane Denial
1 Arcane Signet
1 Arbor Elf
1 Beast Within
1 Bitterblossom
1 Bloom Tender
1 Bojuka Bog
1 Brazen Borrower
1 Breeding Pool
1 Cavern of Souls
1 Command Tower
1 Counterspell
1 Cyclonic Rift
1 Devoted Druid
1 Dimir Signet
1 Elvish Archdruid
1 Elvish Mystic
1 Faerie Harbinger
1 Faerie Mastermind
1 Forest
1 Glen Elendra Archmage
1 Green Sun's Zenith
1 Guardian Project
1 Heritage Druid
1 Heroic Intervention
1 Island
1 Lathril, Blade of the Elves
1 Leyline of Anticipation
1 Llanowar Elves
1 Marwyn, the Nurturer
1 Mistbind Clique
1 Mystic Remora
1 Oona, Queen of the Fae
1 Overgrown Tomb
1 Path of Ancestry
1 Priest of Titania
1 Reality Shift
1 Rhystic Study
1 Seedborn Muse
1 Sol Ring
1 Spellstutter Sprite
1 Swamp
1 Swan Song
1 Sword of the Paruns
1 Talion, the Kindly Lord
1 Tegwyll, Duke of Splendor
1 Vedalken Orrery
1 Watery Grave
1 Wirewood Lodge
1 Wirewood Symbiote
1 Zagoth Triome
1 Umbral Mantle
1 Clearwater Pathway
1 Darkbore Pathway
1 Barkchannel Pathway
1 Dreamroot Cascade
1 Shipwreck Marsh
1 Deathcap Glade
1 Hinterland Harbor
1 Drowned Catacomb
1 Woodland Cemetery
1 Yavimaya Coast
1 Llanowar Wastes
1 Underground River
7 Forest
6 Island
6 Swamp

the commander is Alela, Cunning Conqueror`;

const PauperDeck = `analyse this pauper deck:
4 Faerie Seer
4 Spellstutter Sprite
4 Ninja of the Deep Hours
2 Moon-Circuit Hacker
4 Faerie Miscreant
4 Counterspell
3 Spell Pierce
3 Snap
3 Preordain
2 Brainstorm
3 Of One Mind
3 Mutagenic Growth
16 Island
2 Ash Barrens
3 Hydroblast
3 Blue Elemental Blast
2 Relic of Progenitus
2 Gut Shot
2 Dispel
3 Echoing Truth`;

const StrategyReply = `You're wrong about Otowara. Mystic Sanctuary is also way more useful than Otowara actually. Also that a lot of my ramp spells require me to sacrifice lands. Mystic Sanctuary lets me return a land from my graveyard or hand. I run Bonny Pall and Farseek which can find Mystic Sanctuary.`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripProtocol(raw) {
  return String(raw || "")
    .replace(/\s*__MANATAP_DEBUG__(.|\n|\r)*?__MANATAP_DEBUG_END__/g, "")
    .replace(/\s*__MANATAP_DEBUG_END_STREAM__(.|\n|\r)*?__MANATAP_DEBUG_END__/g, "")
    .replace(/\s*__MANATAP_CHAT_METADATA__(.|\n|\r)*?__MANATAP_CHAT_METADATA_END__/g, "")
    .replace(/\s*\[DONE\]\s*$/g, "")
    .trim();
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`request timed out after ${opts.requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function signIn(label, email, password) {
  if (!email || !password) return null;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase URL/anon key for auth tests.");
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${label} sign-in failed: ${error.message}`);
  return { label, client, user: data.user, accessToken: data.session?.access_token || "" };
}

async function chooseDeck(account) {
  if (!account?.client || !account.user) return null;
  const { data: decks, error } = await account.client
    .from("decks")
    .select("id,title,commander,format,created_at")
    .eq("user_id", account.user.id)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error || !Array.isArray(decks) || decks.length === 0) return null;
  for (const deck of decks) {
    const { count } = await account.client
      .from("deck_cards")
      .select("id", { count: "exact", head: true })
      .eq("deck_id", deck.id);
    if ((count || 0) >= 20) return { ...deck, cardCount: count || 0 };
  }
  return { ...decks[0], cardCount: 0 };
}

function authHeaders(tier, account) {
  if (tier === "guest") {
    const token = `chat-audit-${Date.now()}-${crypto.randomUUID()}`;
    return {
      "x-guest-session-token": token,
      cookie: `guest_session_token=${token}`,
    };
  }
  return account?.accessToken ? { authorization: `Bearer ${account.accessToken}` } : {};
}

async function callStream({ tier, account, body }) {
  const started = Date.now();
  const res = await fetchWithTimeout(`${opts.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(tier, account),
    },
    body: JSON.stringify(body),
  });
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json?.ok !== false && !json?.fallback, status: res.status, json, text: String(json.text || json.message || json.error?.message || json.error || ""), latencyMs: Date.now() - started };
  }
  const raw = await res.text();
  return { ok: res.ok, status: res.status, text: stripProtocol(raw), rawTail: raw.slice(-240), latencyMs: Date.now() - started };
}

async function callJson({ tier, account, body }) {
  const started = Date.now();
  const res = await fetchWithTimeout(`${opts.baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(tier, account),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(async () => ({ text: await res.text().catch(() => "") }));
  return { ok: res.ok && json?.ok !== false, status: res.status, json, text: String(json.text || json.message?.content || json.error?.message || json.error || ""), latencyMs: Date.now() - started };
}

function evaluate(text, expect = {}) {
  const failures = [];
  const output = String(text || "").trim();
  if (!output) failures.push("empty response");
  if (typeof expect.minChars === "number" && output.length < expect.minChars) failures.push(`response too short (${output.length} < ${expect.minChars})`);
  for (const re of GLOBAL_FORBIDDEN) if (re.test(output)) failures.push(`global forbidden pattern: ${re}`);
  for (const re of expect.mustMatch || []) if (!re.test(output)) failures.push(`missing pattern: ${re}`);
  for (const group of expect.mustMatchAny || []) if (!group.some((re) => re.test(output))) failures.push(`missing any pattern: ${group.map(String).join(", ")}`);
  for (const re of expect.mustNotMatch || []) if (re.test(output)) failures.push(`forbidden pattern: ${re}`);
  return { passed: failures.length === 0, failures };
}

function baseBody(text, extra = {}) {
  return {
    text,
    threadId: null,
    sourcePage: `chat-audit ${opts.baseUrl.includes("localhost") ? "local" : "live"}`,
    eval_run_id: Date.now(),
    ...extra,
  };
}

function buildCases(accounts, decks) {
  const cases = [];
  for (const tier of ["guest", "free", "pro"]) {
    cases.push({
      id: `${tier}:stream:rules`,
      tier,
      route: "stream",
      body: baseBody("Explain trample plus deathtouch in one practical combat example."),
      expect: { mustMatch: [/trample/i, /deathtouch/i], minChars: 80 },
    });
    cases.push({
      id: `${tier}:stream:false-card-extraction`,
      tier,
      route: "stream",
      body: baseBody(StrategyReply, { context: { format: "commander" } }),
      expect: { mustMatchAny: [[/Mystic Sanctuary/i, /Farseek/i, /Otowara/i]], mustNotMatch: [/also way more useful/i, /couldn.t resolve/i], minChars: 120 },
    });
    cases.push({
      id: `${tier}:stream:alela-paste`,
      tier,
      route: "stream",
      body: baseBody(AlelaDeck, { context: { format: "commander" } }),
      expect: { mustMatch: [/Alela/i], mustNotMatch: [/Maralen[^.\n]{0,80}(commander|led|helm)/i, /\b13 lands\b/i, /custom card list/i], minChars: 300 },
    });
    cases.push({
      id: `${tier}:stream:pauper-paste`,
      tier,
      route: "stream",
      body: baseBody(PauperDeck, { context: { format: "pauper" } }),
      expect: { mustMatch: [/pauper/i], mustNotMatch: [/commander tax/i, /100-card/i], minChars: 220 },
    });
    cases.push({
      id: `${tier}:json:alela-fallback`,
      tier,
      route: "json",
      body: baseBody(AlelaDeck, { context: { format: "commander" } }),
      expect: { mustMatch: [/Alela/i], mustNotMatch: [/Maralen[^.\n]{0,80}(commander|led|helm)/i, /\b13 lands\b/i, /custom card list/i], minChars: 200 },
    });
  }
  for (const tier of ["free", "pro"]) {
    const deck = decks[tier];
    if (!deck?.id) continue;
    cases.push({
      id: `${tier}:stream:linked-deck-analysis`,
      tier,
      route: "stream",
      body: baseBody("Analyse this linked deck and give me 3 specific fixes.", { context: { deckId: deck.id } }),
      expect: { mustMatchAny: [[/fix/i, /upgrade/i, /cut/i, /mana/i]], mustNotMatch: [/paste.*deck/i, /link.*deck/i], minChars: 260 },
      deck: { id: deck.id, title: deck.title, commander: deck.commander, format: deck.format, cardCount: deck.cardCount },
    });
    cases.push({
      id: `${tier}:stream:linked-deck-followup`,
      tier,
      route: "stream",
      body: baseBody("What should I cut first from this deck?", { context: { deckId: deck.id } }),
      expect: { mustMatchAny: [[/cut/i, /remove/i, /trim/i]], mustNotMatch: [/paste.*deck/i, /link.*deck/i], minChars: 180 },
      deck: { id: deck.id, title: deck.title, commander: deck.commander, format: deck.format, cardCount: deck.cardCount },
    });
  }
  return cases;
}

async function main() {
  const free = await signIn("free", FREE_EMAIL, FREE_PASSWORD);
  const pro = await signIn("pro", PRO_EMAIL, PRO_PASSWORD);
  const accounts = { guest: null, free, pro };
  const decks = {
    free: await chooseDeck(free),
    pro: await chooseDeck(pro),
  };

  const cases = buildCases(accounts, decks);
  const results = [];
  console.log(`Running ${cases.length} chat audit cases against ${opts.baseUrl}`);
  for (const c of cases) {
    process.stdout.write(`- ${c.id} ... `);
    let response;
    try {
      response = c.route === "json"
        ? await callJson({ tier: c.tier, account: accounts[c.tier], body: c.body })
        : await callStream({ tier: c.tier, account: accounts[c.tier], body: c.body });
      if (response.status === 429) {
        console.log("RATE_LIMITED");
        results.push({
          id: c.id,
          tier: c.tier,
          route: c.route,
          status: "rate_limited",
          httpStatus: response.status,
          latencyMs: response.latencyMs,
          responsePreview: response.text.slice(0, 1200),
        });
        if (opts.delayMs) await delay(opts.delayMs);
        continue;
      }
      const check = evaluate(response.text, c.expect);
      const status = response.ok && check.passed ? "pass" : "fail";
      console.log(status.toUpperCase());
      if (check.failures.length) for (const f of check.failures) console.log(`  ${f}`);
      results.push({
        id: c.id,
        tier: c.tier,
        route: c.route,
        status,
        httpStatus: response.status,
        latencyMs: response.latencyMs,
        deck: c.deck,
        failures: check.failures,
        responsePreview: response.text.slice(0, 1200),
      });
    } catch (error) {
      console.log("ERROR");
      console.log(`  ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        id: c.id,
        tier: c.tier,
        route: c.route,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (opts.delayMs) await delay(opts.delayMs);
  }

  const summary = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const out = {
    generatedAt: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    summary,
    decks: {
      free: decks.free ? { id: decks.free.id, title: decks.free.title, commander: decks.free.commander, format: decks.free.format, cardCount: decks.free.cardCount } : null,
      pro: decks.pro ? { id: decks.pro.id, title: decks.pro.title, commander: decks.pro.commander, format: decks.pro.format, cardCount: decks.pro.cardCount } : null,
    },
    results,
  };
  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(out, null, 2));
  console.log(`Summary: ${JSON.stringify(summary)}. Results: ${opts.output}`);
  if ((summary.fail || 0) > 0 || (summary.error || 0) > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
