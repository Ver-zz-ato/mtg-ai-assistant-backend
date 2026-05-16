import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { SAMPLE_DECKS } from "@/lib/sample-decks";
import { aggregateCards, norm, totalDeckQty } from "@/lib/deck/generation-helpers";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { getFormatRules, isCommanderFormatString } from "@/lib/deck/formatRules";
import { buildGenerationPreviewFacts } from "@/lib/deck/generation-preview-facts";

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

type PreviewFacts = {
  land_count: number;
  ramp_count: number;
  draw_count: number;
  interaction_count: number;
  avg_cmc: number;
  curve_histogram: number[];
  curve_profile?: string;
  warning_flags?: string[];
};

type EvalDeck = {
  id: string;
  name: string;
  format: AnalyzeFormat;
  commander: string | null;
  sourceDeckText: string;
  sourceLabel: string;
  expectedLegality?: "noop" | "size_only_review" | "repair";
};

type RouteResponse = {
  ok?: boolean;
  error?: string;
  summary?: string;
  why?: string;
  warnings?: string[];
  deckText?: string;
  decklist?: Array<{ name: string; qty: number }>;
  commander?: string | null;
  format?: string;
  previewFacts?: PreviewFacts;
  transformIntent?: string;
  changeReasons?: {
    added?: Record<string, string>;
    removed?: Record<string, string>;
  } | null;
};

type EvalResult = {
  deckId: string;
  deckName: string;
  format: AnalyzeFormat;
  pass: TransformIntent;
  status: "pass" | "warn" | "fail";
  hardIssues: string[];
  cautions: string[];
  sourceLabel: string;
  added: Array<{ name: string; qty: number }>;
  removed: Array<{ name: string; qty: number }>;
  finalCount: number;
  targetCount: number;
  warnings: string[];
  summary: string;
  elapsedMs: number;
  previewFactsBefore?: PreviewFacts;
  previewFactsAfter?: PreviewFacts;
  raw?: RouteResponse;
  why?: string;
};

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const jsonOnly = args.has("--json");
const verbose = args.has("--verbose");
const deckFilters = rawArgs
  .filter((arg) => arg.startsWith("--deck="))
  .map((arg) => arg.slice("--deck=".length).trim())
  .filter(Boolean);
const passFilters = rawArgs
  .filter((arg) => arg.startsWith("--pass="))
  .map((arg) => arg.slice("--pass=".length).trim() as TransformIntent)
  .filter(Boolean);
const rerunReportArg = rawArgs.find((arg) => arg.startsWith("--rerun-fails-from="));
const rerunFailedFrom = rerunReportArg ? rerunReportArg.slice("--rerun-fails-from=".length).trim() : "";
const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const reportDir = path.join(process.cwd(), "test-results", "ai-workshop-eval");
const nowStamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonOut = path.join(reportDir, `ai-workshop-eval-${nowStamp}.json`);
const mdOut = path.join(reportDir, `ai-workshop-eval-${nowStamp}.md`);

const PASS_LABELS: Record<TransformIntent, string> = {
  general: "General cleanup",
  improve_mana_base: "Mana base",
  tighten_curve: "Curve",
  add_interaction: "Interaction",
  lower_budget: "Lower budget",
  more_casual: "More casual",
  more_optimized: "Raise power",
  fix_legality: "Fix legality",
};

const ALL_PASSES: TransformIntent[] = [
  "fix_legality",
  "general",
  "improve_mana_base",
  "tighten_curve",
  "add_interaction",
  "lower_budget",
  "more_casual",
  "more_optimized",
];

const CORE_FULL_PASS_IDS = new Set([
  "atraxa-superfriends",
  "yuriko-ninjas",
  "teysa-aristocrats",
  "ghired-tokens",
  "lathril-elves",
  "modern-burn",
]);

const EXPENSIVE_STAPLE_WATCHLIST = new Set([
  "mana crypt",
  "the one ring",
  "gaea's cradle",
  "rhystic study",
  "smothering tithe",
  "dockside extortionist",
  "jeweled lotus",
  "force of will",
  "cyclonic rift",
  "fierce guardianship",
  "vampiric tutor",
  "demonic tutor",
]);

const SPIKY_WATCHLIST = new Set([
  "thassa's oracle",
  "demonic consultation",
  "underworld breach",
  "mana crypt",
  "jeweled lotus",
  "ad nauseam",
  "lion's eye diamond",
  "trinisphere",
  "winter orb",
]);

const MODERN_DECK = [
  "4 Monastery Swiftspear",
  "4 Lightning Bolt",
  "4 Lava Spike",
  "4 Skewer the Critics",
  "4 Eidolon of the Great Revel",
  "4 Rift Bolt",
  "4 Boros Charm",
  "4 Roiling Vortex",
  "18 Mountain",
  "4 Sunbaked Canyon",
  "4 Inspiring Vantage",
  "2 Sacred Foundry",
].join("\n");

const PIONEER_DECK = [
  "4 Monastery Swiftspear",
  "4 Play with Fire",
  "4 Kumano Faces Kakkazan",
  "4 Monstrous Rage",
  "4 Slickshot Show-Off",
  "4 Soul-Scar Mage",
  "4 Light Up the Stage",
  "4 Wizard's Lightning",
  "4 Ramunap Ruins",
  "20 Mountain",
  "4 Den of the Bugbear",
].join("\n");

const STANDARD_DECK = [
  "4 Heartfire Hero",
  "4 Monastery Swiftspear",
  "4 Monstrous Rage",
  "4 Lightning Strike",
  "4 Emberheart Challenger",
  "4 Burst Lightning",
  "4 Shock",
  "4 Slickshot Show-Off",
  "20 Mountain",
  "4 Rockface Village",
  "4 Mirran Banesplitter",
].join("\n");

const PAUPER_DECK = [
  "4 Kessig Flamebreather",
  "4 Ghitu Lavarunner",
  "4 Lightning Bolt",
  "4 Chain Lightning",
  "4 Lava Dart",
  "4 Skewer the Critics",
  "4 Wrenn's Resolve",
  "4 Reckless Impulse",
  "18 Mountain",
  "4 Experimental Synthesizer",
  "4 Implement of Combustion",
  "2 Fireblast",
].join("\n");

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

function cleanDeckText(deckText: string): string {
  return deckText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("//"))
    .join("\n");
}

function rowsFromDeckText(deckText: string) {
  return aggregateCards(parseDeckText(deckText));
}

function mapRows(rows: Array<{ name: string; qty: number }>): Map<string, { name: string; qty: number }> {
  const out = new Map<string, { name: string; qty: number }>();
  for (const row of rows) {
    const key = norm(row.name);
    const existing = out.get(key);
    if (existing) existing.qty += row.qty;
    else out.set(key, { name: row.name, qty: row.qty });
  }
  return out;
}

function diffDeckRows(
  sourceRows: Array<{ name: string; qty: number }>,
  resultRows: Array<{ name: string; qty: number }>,
): { added: Array<{ name: string; qty: number }>; removed: Array<{ name: string; qty: number }> } {
  const source = mapRows(sourceRows);
  const result = mapRows(resultRows);
  const keys = new Set([...source.keys(), ...result.keys()]);
  const added: Array<{ name: string; qty: number }> = [];
  const removed: Array<{ name: string; qty: number }> = [];
  for (const key of keys) {
    const before = source.get(key)?.qty || 0;
    const after = result.get(key)?.qty || 0;
    if (after > before) added.push({ name: result.get(key)?.name || source.get(key)?.name || key, qty: after - before });
    if (before > after) removed.push({ name: source.get(key)?.name || result.get(key)?.name || key, qty: before - after });
  }
  added.sort((a, b) => a.name.localeCompare(b.name));
  removed.sort((a, b) => a.name.localeCompare(b.name));
  return { added, removed };
}

function compactWarningList(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

const scryfallCardCache = new Map<string, { color_identity: string[]; legalities?: Record<string, string> | null } | null>();
const commanderColorCache = new Map<string, string[]>();

async function fetchScryfallCard(name: string) {
  const key = norm(name);
  if (scryfallCardCache.has(key)) return scryfallCardCache.get(key) ?? null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, {
      headers: { "user-agent": "ai-workshop-eval/1.0" },
    });
    if (!res.ok) {
      scryfallCardCache.set(key, null);
      return null;
    }
    const json = await res.json();
    const value = {
      color_identity: Array.isArray(json?.color_identity) ? json.color_identity.map((value: unknown) => String(value).toUpperCase()) : [],
      legalities: json?.legalities && typeof json.legalities === "object" ? json.legalities : null,
    };
    scryfallCardCache.set(key, value);
    return value;
  } catch {
    scryfallCardCache.set(key, null);
    return null;
  }
}

async function resolveCommanderColors(commander: string) {
  const key = norm(commander);
  if (commanderColorCache.has(key)) return commanderColorCache.get(key) ?? [];
  const card = await fetchScryfallCard(commander);
  const colors = card?.color_identity ?? [];
  commanderColorCache.set(key, colors);
  return colors;
}

async function resolveBearerToken(): Promise<{ token: string | null; cleanup: (() => Promise<void>) | null }> {
  const email = process.env.AI_STRESS_EMAIL || process.env.DEV_LOGIN_EMAIL || "";
  const password = process.env.AI_STRESS_PASSWORD || process.env.DEV_LOGIN_PASSWORD || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (email && password && url && anon) {
    const supabase = createClient(url, anon);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session?.access_token) {
      return { token: data.session.access_token, cleanup: null };
    }
  }

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !anon || !serviceRole) return { token: null, cleanup: null };

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  const evalEmail = `ai-workshop-eval+${Date.now()}@manatap.local`;
  const evalPassword = `CodexEval!${Date.now()}!`;
  const created = await admin.auth.admin.createUser({
    email: evalEmail,
    password: evalPassword,
    email_confirm: true,
    user_metadata: {
      is_pro: true,
      pro: true,
    },
  });
  if (created.error || !created.data.user?.id) {
    return { token: null, cleanup: null };
  }

  try {
    await admin.from("profiles").upsert({ id: created.data.user.id, is_pro: true });
  } catch {}

  const supabase = createClient(url, anon);
  const login = await supabase.auth.signInWithPassword({ email: evalEmail, password: evalPassword });
  if (login.error || !login.data.session?.access_token) {
    return {
      token: null,
      cleanup: async () => {
        await admin.auth.admin.deleteUser(created.data.user!.id);
      },
    };
  }

  return {
    token: login.data.session.access_token,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(created.data.user!.id);
    },
  };
}

async function pingServer(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { headers: { "user-agent": "ai-workshop-eval/1.0" } });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchPrecons(limit = 2): Promise<EvalDeck[]> {
  try {
    const res = await fetch(`${baseUrl}/api/decks/precons?limit=${limit}`, { headers: { "user-agent": "ai-workshop-eval/1.0" } });
    if (!res.ok) return [];
    const json = await res.json();
    const decks = Array.isArray(json?.decks) ? json.decks : [];
    return decks
      .filter((deck: any) => deck?.format === "Commander" && typeof deck.deck_text === "string" && deck.deck_text.trim())
      .slice(0, limit)
      .map((deck: any, index: number) => ({
        id: `precon-${index + 1}-${String(deck.id || deck.title || "deck").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: String(deck.title || deck.name || `Precon ${index + 1}`),
        format: "Commander" as const,
        commander: typeof deck.commander === "string" ? deck.commander : null,
        sourceDeckText: cleanDeckText(String(deck.deck_text)),
        sourceLabel: "precon",
        expectedLegality: "noop" as const,
      }));
  } catch {
    return [];
  }
}

function buildRepresentativeDecks(precons: EvalDeck[]): EvalDeck[] {
  const expectedLegalityById: Partial<Record<string, EvalDeck["expectedLegality"]>> = {
    "ur-dragon-tribal": "size_only_review",
    "atraxa-superfriends": "repair",
    "edgar-markov-vampires": "size_only_review",
    "ghired-tokens": "size_only_review",
    "yuriko-ninjas": "size_only_review",
    "kess-spellslinger": "repair",
    "teysa-aristocrats": "repair",
    "chulane-value": "repair",
    "grand-arbiter-stax": "repair",
    "lathril-elves": "repair",
  };

  const sampleCommanderIds = [
    "ur-dragon-tribal",
    "atraxa-superfriends",
    "edgar-markov-vampires",
    "ghired-tokens",
    "yuriko-ninjas",
    "kess-spellslinger",
    "teysa-aristocrats",
    "chulane-value",
    "grand-arbiter-stax",
    "lathril-elves",
  ];

  const commanderDecks: EvalDeck[] = sampleCommanderIds
    .map((id) => SAMPLE_DECKS.find((deck) => deck.id === id))
    .filter((deck): deck is NonNullable<typeof deck> => Boolean(deck))
    .map((deck) => ({
      id: deck.id,
      name: deck.name,
      format: "Commander" as const,
      commander: deck.commander,
      sourceDeckText: cleanDeckText(deck.deckList),
      sourceLabel: "sample_commander",
      expectedLegality: expectedLegalityById[deck.id] ?? "noop",
    }));

  const constructedDecks: EvalDeck[] = [
    { id: "modern-burn", name: "Modern Burn", format: "Modern", commander: null, sourceDeckText: MODERN_DECK, sourceLabel: "sample_constructed", expectedLegality: "noop" },
    { id: "pioneer-red", name: "Pioneer Red", format: "Pioneer", commander: null, sourceDeckText: PIONEER_DECK, sourceLabel: "sample_constructed", expectedLegality: "noop" },
    { id: "standard-red", name: "Standard Red", format: "Standard", commander: null, sourceDeckText: STANDARD_DECK, sourceLabel: "sample_constructed", expectedLegality: "repair" },
    { id: "pauper-burn", name: "Pauper Burn", format: "Pauper", commander: null, sourceDeckText: PAUPER_DECK, sourceLabel: "sample_constructed", expectedLegality: "noop" },
  ];

  const lathril = commanderDecks.find((deck) => deck.id === "lathril-elves");

  const variants: EvalDeck[] = [];
  const cleanPrecon = precons[0];
  if (cleanPrecon) {
    const rows = rowsFromDeckText(cleanPrecon.sourceDeckText);
    const removableIndex = rows.findIndex((row, index) => index > 0 && row.qty > 0);
    const trimmed = rows.map((row) => ({ ...row }));
    if (removableIndex >= 0) {
      trimmed[removableIndex] = { ...trimmed[removableIndex], qty: Math.max(0, trimmed[removableIndex].qty - 1) };
    }
    variants.push({
      id: "precon-99-clean",
      name: `${cleanPrecon.name} (99 clean)`,
      format: "Commander",
      commander: cleanPrecon.commander,
      sourceDeckText: trimmed.filter((row) => row.qty > 0).map((row) => `${row.qty} ${row.name}`).join("\n"),
      sourceLabel: "size_review_variant",
      expectedLegality: "size_only_review",
    });
  }
  if (lathril) {
    const rows = rowsFromDeckText(lathril.sourceDeckText);
    const updated = rows.map((row) => ({ ...row }));
    const forest = updated.find((row) => row.name.toLowerCase() === "forest");
    if (forest && forest.qty > 0) {
      forest.qty -= 1;
      updated.push({ name: "Lightning Bolt", qty: 1 });
    }
    variants.push({
      id: "lathril-offcolor",
      name: "Lathril Elves (off-color bolt)",
      format: "Commander",
      commander: lathril.commander,
      sourceDeckText: updated.filter((row) => row.qty > 0).map((row) => `${row.qty} ${row.name}`).join("\n"),
      sourceLabel: "invalid_variant",
      expectedLegality: "repair",
    });
  }

  return [...commanderDecks, ...constructedDecks, ...precons, ...variants];
}

async function postTransform(
  bearerToken: string,
  deck: EvalDeck,
  pass: TransformIntent,
): Promise<{ status: number; elapsedMs: number; json: RouteResponse }> {
  const body = {
    sourceDeckText: deck.sourceDeckText,
    format: deck.format,
    commander: deck.commander,
    transformIntent: pass,
    powerLevel: deck.format === "Commander" ? "Casual" : "Focused",
    budget: "Moderate",
  };
  const started = Date.now();
  const res = await fetch(`${baseUrl}/api/deck/transform`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${bearerToken}`,
      "user-agent": "ai-workshop-eval/1.0",
    },
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - started;
  const raw = await res.text();
  let json: RouteResponse = {};
  try {
    json = JSON.parse(raw);
  } catch {
    json = { ok: false, error: raw.slice(0, 500) };
  }
  return { status: res.status, elapsedMs, json };
}

async function commanderColorIssue(deck: EvalDeck, resultRows: Array<{ name: string; qty: number }>, addedRows: Array<{ name: string; qty: number }>): Promise<string | null> {
  if (!deck.commander || !isCommanderFormatString(deck.format)) return null;
  const commanderColors = await resolveCommanderColors(deck.commander);
  if (!commanderColors.length) return null;
  const offenders: string[] = [];
  const rowsToCheck = addedRows.length ? addedRows : [];
  for (const row of rowsToCheck) {
    const detail = await fetchScryfallCard(row.name);
    if (!detail) continue;
    const within = detail.color_identity.every((color: string) => commanderColors.includes(color));
    if (!within) offenders.push(row.name);
  }
  return offenders.length ? `Output still contains off-color additions for ${deck.commander}: ${offenders.slice(0, 5).join(", ")}` : null;
}

function evaluateLegalityCase(deck: EvalDeck, added: Array<{ name: string; qty: number }>, removed: Array<{ name: string; qty: number }>, summary: string, warnings: string[]): { hardIssues: string[]; cautions: string[] } {
  const hardIssues: string[] = [];
  const cautions: string[] = [];

  if (deck.expectedLegality === "noop") {
    if (added.length || removed.length) {
      hardIssues.push(`Expected no-op legality check, but got ${added.length} additions and ${removed.length} removals.`);
    }
    if (!/no legality changes needed/i.test(summary)) {
      cautions.push("Expected explicit no-op legality summary but did not see it.");
    }
  }

  if (deck.expectedLegality === "size_only_review") {
    if (added.length || removed.length) {
      hardIssues.push(`Expected deck-size review only, but got ${added.length} additions and ${removed.length} removals.`);
    }
    if (!/deck size needs review/i.test(summary)) {
      hardIssues.push("Expected deck-size-only review summary.");
    }
  }

  if (deck.expectedLegality === "repair") {
    if (!added.length && !removed.length) {
      hardIssues.push("Expected legality repair changes, but got no adds/removals.");
    }
    if (!warnings.length && !/legality|color identity/i.test(summary)) {
      cautions.push("Repair path returned without clear legality/color identity note.");
    }
  }

  return { hardIssues, cautions };
}

function evaluatePassHeuristics(
  pass: TransformIntent,
  beforeFacts: PreviewFacts | undefined,
  afterFacts: PreviewFacts | undefined,
  added: Array<{ name: string; qty: number }>,
  removed: Array<{ name: string; qty: number }>,
): string[] {
  const cautions: string[] = [];
  if (!beforeFacts || !afterFacts) return cautions;
  switch (pass) {
    case "general":
      if (added.reduce((sum, row) => sum + row.qty, 0) + removed.reduce((sum, row) => sum + row.qty, 0) > 24) {
        cautions.push("General cleanup changed more than 24 cards; that feels aggressive for a cleanup pass.");
      }
      break;
    case "improve_mana_base":
      if (afterFacts.land_count < beforeFacts.land_count && afterFacts.ramp_count < beforeFacts.ramp_count) {
        cautions.push("Mana base pass reduced both land count and ramp count.");
      }
      break;
    case "tighten_curve":
      if (beforeFacts.avg_cmc > 0 && afterFacts.avg_cmc > beforeFacts.avg_cmc + 0.15) {
        cautions.push(`Curve pass increased avg CMC from ${beforeFacts.avg_cmc} to ${afterFacts.avg_cmc}.`);
      }
      break;
    case "add_interaction":
      if (afterFacts.interaction_count < beforeFacts.interaction_count) {
        cautions.push(`Interaction pass reduced interaction count from ${beforeFacts.interaction_count} to ${afterFacts.interaction_count}.`);
      }
      break;
    case "lower_budget":
      if (added.some((row) => EXPENSIVE_STAPLE_WATCHLIST.has(norm(row.name)))) {
        cautions.push("Budget pass added at least one known expensive staple.");
      }
      break;
    case "more_casual":
      if (added.some((row) => SPIKY_WATCHLIST.has(norm(row.name)))) {
        cautions.push("Casual pass added at least one spiky/cEDH-leaning card.");
      }
      break;
    case "more_optimized":
      if (
        beforeFacts.avg_cmc > 0 &&
        afterFacts.interaction_count < beforeFacts.interaction_count - 1 &&
        afterFacts.avg_cmc > beforeFacts.avg_cmc + 0.2
      ) {
        cautions.push("Optimized pass looked less interactive and clunkier than the source.");
      }
      break;
    default:
      break;
  }
  return cautions;
}

function evaluateWhyQuality(args: {
  pass: TransformIntent;
  whyText: string;
  added: Array<{ name: string; qty: number }>;
  removed: Array<{ name: string; qty: number }>;
  changeReasons?: RouteResponse["changeReasons"];
}): { hardIssues: string[]; cautions: string[] } {
  const hardIssues: string[] = [];
  const cautions: string[] = [];
  const why = args.whyText.trim();
  const addedReasons = args.changeReasons?.added ?? {};
  const removedReasons = args.changeReasons?.removed ?? {};

  if ((args.added.length || args.removed.length) && !why) {
    hardIssues.push("Missing overall why text for a pass that suggested swaps.");
  }
  if (why && why.length < 40) {
    cautions.push("Overall why text is very short and may not be useful.");
  }

  for (const row of args.added) {
    const reason = addedReasons[norm(row.name)];
    if (!reason) {
      cautions.push(`Missing added-card reason for ${row.name}.`);
      continue;
    }
    if (reason.length < 18) cautions.push(`Added-card reason for ${row.name} is too brief.`);
  }
  for (const row of args.removed) {
    const reason = removedReasons[norm(row.name)];
    if (!reason) {
      cautions.push(`Missing removed-card reason for ${row.name}.`);
      continue;
    }
    if (reason.length < 18) cautions.push(`Removed-card reason for ${row.name} is too brief.`);
  }

  if (
    args.pass === "fix_legality" &&
    why &&
    !/did not invent optimization swaps/i.test(why) &&
    /\bupgrade|upgraded|improve mana|better curve|budget upgrade|power up|optimi[sz]e|stronger lines?\b/i.test(why)
  ) {
    hardIssues.push("Legality why text drifted into optimization language.");
  }

  return { hardIssues, cautions };
}

function toMarkdown(results: EvalResult[], summary: { total: number; pass: number; warn: number; fail: number }) {
  const lines: string[] = [];
  lines.push("# AI Workshop Eval Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Base URL: ${baseUrl}`);
  lines.push("");
  lines.push(`- Total runs: ${summary.total}`);
  lines.push(`- Passed: ${summary.pass}`);
  lines.push(`- Warned: ${summary.warn}`);
  lines.push(`- Failed: ${summary.fail}`);
  lines.push("");

  const grouped = new Map<string, EvalResult[]>();
  for (const result of results) {
    const key = `${result.deckName} (${result.format})`;
    const list = grouped.get(key) || [];
    list.push(result);
    grouped.set(key, list);
  }

  for (const [deckLabel, deckResults] of grouped) {
    lines.push(`## ${deckLabel}`);
    lines.push("");
    for (const result of deckResults) {
      lines.push(`### ${PASS_LABELS[result.pass]} - ${result.status.toUpperCase()}`);
      lines.push("");
      lines.push(`- Count: ${result.finalCount}/${result.targetCount}`);
      lines.push(`- Added: ${result.added.map((row) => `${row.qty} ${row.name}`).join(", ") || "none"}`);
      lines.push(`- Removed: ${result.removed.map((row) => `${row.qty} ${row.name}`).join(", ") || "none"}`);
      lines.push(`- Summary: ${result.summary || "none"}`);
      lines.push(`- Why: ${result.why || "none"}`);
      if (result.warnings.length) lines.push(`- Warnings: ${result.warnings.join(" | ")}`);
      if (result.hardIssues.length) lines.push(`- Hard issues: ${result.hardIssues.join(" | ")}`);
      if (result.cautions.length) lines.push(`- Cautions: ${result.cautions.join(" | ")}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function printDetailedResult(result: EvalResult) {
  console.log("");
  console.log(`[${result.status.toUpperCase()}] ${result.deckName} (${result.format}) :: ${PASS_LABELS[result.pass]}`);
  console.log(`  source: ${result.sourceLabel}`);
  console.log(`  time: ${result.elapsedMs}ms`);
  console.log(`  count: ${result.finalCount}/${result.targetCount}`);
  console.log(`  summary: ${result.summary || "none"}`);
  console.log(`  why: ${result.why || "none"}`);
  console.log(`  added: ${result.added.map((row) => `+${row.qty} ${row.name}`).join(", ") || "none"}`);
  console.log(`  removed: ${result.removed.map((row) => `-${row.qty} ${row.name}`).join(", ") || "none"}`);
  const changeReasons = result.raw?.changeReasons;
  if (changeReasons?.added && Object.keys(changeReasons.added).length) {
    for (const [card, reason] of Object.entries(changeReasons.added)) {
      console.log(`  why+ ${card}: ${reason}`);
    }
  }
  if (changeReasons?.removed && Object.keys(changeReasons.removed).length) {
    for (const [card, reason] of Object.entries(changeReasons.removed)) {
      console.log(`  why- ${card}: ${reason}`);
    }
  }
  if (result.warnings.length) {
    console.log(`  warnings: ${result.warnings.join(" | ")}`);
  }
  if (result.hardIssues.length) {
    for (const issue of result.hardIssues) console.log(`  hard: ${issue}`);
  }
  if (result.cautions.length) {
    for (const caution of result.cautions) console.log(`  warn: ${caution}`);
  }
}

function loadFailedCasesFromReport(reportPath: string): Array<{ deckId: string; pass: TransformIntent }> {
  if (!reportPath) return [];
  const absolute = path.isAbsolute(reportPath) ? reportPath : path.join(process.cwd(), reportPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Could not find prior report: ${absolute}`);
  }
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8")) as { results?: EvalResult[] };
  const failed = Array.isArray(parsed?.results) ? parsed.results.filter((result) => result.status === "fail") : [];
  return failed.map((result) => ({ deckId: result.deckId, pass: result.pass }));
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });

  const serverOk = await pingServer();
  if (!serverOk) {
    console.error(`Cannot reach ${baseUrl}/api/health. Start the website locally or set BASE_URL.`);
    process.exit(2);
  }

  const auth = await resolveBearerToken();
  const bearerToken = auth.token;
  if (!bearerToken) {
    console.error("Could not resolve a bearer token from DEV_LOGIN_* / AI_STRESS_* env vars or service-role fallback.");
    process.exit(2);
  }

  const precons = await fetchPrecons(2);
  const allDecks = buildRepresentativeDecks(precons);
  const failedCases = loadFailedCasesFromReport(rerunFailedFrom);
  const allowedDeckIds = new Set([
    ...deckFilters,
    ...failedCases.map((entry) => entry.deckId),
  ]);
  const allowedPasses = new Set<TransformIntent>([
    ...passFilters,
    ...failedCases.map((entry) => entry.pass),
  ]);
  const failedCaseSet = new Set(failedCases.map((entry) => `${entry.deckId}::${entry.pass}`));
  const decks = allowedDeckIds.size
    ? allDecks.filter((deck) => allowedDeckIds.has(deck.id))
    : allDecks;
  const results: EvalResult[] = [];

  for (const deck of decks) {
    let baselineFacts: PreviewFacts | undefined;
    const basePasses = CORE_FULL_PASS_IDS.has(deck.id) ? ALL_PASSES : (["fix_legality"] as TransformIntent[]);
    const passes = basePasses.filter((pass) => {
      if (failedCaseSet.size > 0) return failedCaseSet.has(`${deck.id}::${pass}`);
      if (allowedPasses.size > 0) return allowedPasses.has(pass);
      return true;
    });
    if (!passes.length) continue;
    if (passes.some((pass) => pass !== "fix_legality")) {
      baselineFacts = await buildGenerationPreviewFacts(
        deck.sourceDeckText,
        deck.commander,
        deck.format,
      ).catch(() => undefined);
    }
    for (const pass of passes) {
      const response = await postTransform(bearerToken, deck, pass);
      const hardIssues: string[] = [];
      const cautions: string[] = [];

      if (response.status < 200 || response.status >= 300) {
        hardIssues.push(`HTTP ${response.status}: ${response.json?.error || "unknown error"}`);
      }
      if (response.json?.ok === false) {
        hardIssues.push(`Route returned ok=false: ${response.json.error || "unknown error"}`);
      }

      const resultRows = Array.isArray(response.json.decklist)
        ? response.json.decklist
        : typeof response.json.deckText === "string"
          ? rowsFromDeckText(response.json.deckText)
          : [];
      const sourceRows = rowsFromDeckText(deck.sourceDeckText);
      const diff = diffDeckRows(sourceRows, resultRows);
      const formatRules = getFormatRules(deck.format);
      const finalCount = totalDeckQty(resultRows);
      const warnings = compactWarningList(response.json.warnings);

      if (!resultRows.length && hardIssues.length === 0) {
        hardIssues.push("Route returned no deck rows.");
      }
      if (finalCount !== formatRules.mainDeckTarget && warnings.length === 0) {
        cautions.push(`Deck count ended at ${finalCount}/${formatRules.mainDeckTarget} without warnings.`);
      }

      const commanderIssue = await commanderColorIssue(deck, resultRows, diff.added);
      if (commanderIssue) hardIssues.push(commanderIssue);

      if (pass === "fix_legality") {
        const legalityEval = evaluateLegalityCase(deck, diff.added, diff.removed, String(response.json.summary || ""), warnings);
        hardIssues.push(...legalityEval.hardIssues);
        cautions.push(...legalityEval.cautions);
        if (!diff.added.length && !diff.removed.length && response.json.previewFacts) {
          baselineFacts = response.json.previewFacts;
        }
      } else {
        cautions.push(...evaluatePassHeuristics(pass, baselineFacts, response.json.previewFacts, diff.added, diff.removed));
      }
      const whyEval = evaluateWhyQuality({
        pass,
        whyText: String(response.json.why || ""),
        added: diff.added,
        removed: diff.removed,
        changeReasons: response.json.changeReasons,
      });
      hardIssues.push(...whyEval.hardIssues);
      cautions.push(...whyEval.cautions);

      const status: EvalResult["status"] = hardIssues.length ? "fail" : cautions.length ? "warn" : "pass";
      results.push({
        deckId: deck.id,
        deckName: deck.name,
        format: deck.format,
        pass,
        status,
        hardIssues,
        cautions,
        sourceLabel: deck.sourceLabel,
        added: diff.added,
        removed: diff.removed,
        finalCount,
        targetCount: formatRules.mainDeckTarget,
        warnings,
        summary: String(response.json.summary || ""),
        why: String(response.json.why || ""),
        elapsedMs: response.elapsedMs,
        previewFactsBefore: baselineFacts,
        previewFactsAfter: response.json.previewFacts,
        raw: response.json,
      });
    }
  }

  const summary = {
    total: results.length,
    pass: results.filter((result) => result.status === "pass").length,
    warn: results.filter((result) => result.status === "warn").length,
    fail: results.filter((result) => result.status === "fail").length,
  };

  fs.writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl,
        decks: decks.map((deck) => ({ id: deck.id, name: deck.name, format: deck.format, sourceLabel: deck.sourceLabel })),
        summary,
        results,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(mdOut, toMarkdown(results, summary));

  if (jsonOnly) {
    console.log(JSON.stringify({ summary, jsonOut, mdOut }, null, 2));
  } else {
    console.log("AI Workshop eval complete.");
    console.log(`Runs: ${summary.total} | pass=${summary.pass} warn=${summary.warn} fail=${summary.fail}`);
    console.log(`JSON: ${jsonOut}`);
    console.log(`Markdown: ${mdOut}`);
    if (verbose) {
      for (const result of results) {
        printDetailedResult(result);
      }
    } else {
      const flagged = results.filter((result) => result.status !== "pass");
      for (const result of flagged.slice(0, 20)) {
        console.log(`- [${result.status.toUpperCase()}] ${result.deckName} :: ${PASS_LABELS[result.pass]}`);
        for (const issue of result.hardIssues) console.log(`    hard: ${issue}`);
        for (const caution of result.cautions) console.log(`    warn: ${caution}`);
      }
    }
  }

  if (auth.cleanup) {
    await auth.cleanup().catch(() => {});
  }

  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
