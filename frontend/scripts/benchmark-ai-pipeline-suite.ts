import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildDeckCompareGrounding } from "@/lib/mobile/deck-compare-grounding";
import { buildGroundedPlaystyleProfile } from "@/lib/quiz/playstyle-grounding";
import { buildGroundedCardExplainPacket } from "@/lib/mobile/card-explain-grounding";
import { buildGroundedScaffoldDeck } from "@/lib/deck/scaffold-builder";
import { enrichDeck } from "@/lib/deck/deck-enrichment";
import { tagCards } from "@/lib/deck/card-role-tags";
import { buildDeckFacts } from "@/lib/deck/deck-facts";
import { buildSynergyDiagnostics } from "@/lib/deck/synergy-diagnostics";
import { buildDeckPlanProfile } from "@/lib/deck/deck-plan-profile";
import { inferDeckAim } from "@/lib/deck/inference";

type BenchmarkResult = {
  id: string;
  group: string;
  passed: boolean;
  message: string;
  sample?: unknown;
};

type DeckSample = {
  deck_id: string;
  commander: string | null;
  format: string;
  deck_text: string;
  title: string | null;
  colors: string[];
};

function loadDotEnv(fileName: string) {
  const file = path.join(process.cwd(), fileName);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

function norm(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function ok(id: string, group: string, sample?: unknown): BenchmarkResult {
  return { id, group, passed: true, message: "ok", sample };
}

function fail(id: string, group: string, message: string, sample?: unknown): BenchmarkResult {
  return { id, group, passed: false, message, sample };
}

function deckTextNames(deckText: string): Array<{ name: string; count: number }> {
  return deckText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      return { name: match ? match[2].trim() : line, count: match ? Number(match[1]) : 1 };
    });
}

async function fetchRealDeckSamples(admin: SupabaseClient, count = 6): Promise<DeckSample[]> {
  const { data: decks, error } = await admin
    .from("decks")
    .select("id, title, commander, format, colors, deck_text")
    .or("is_public.eq.true,public.eq.true")
    .order("updated_at", { ascending: false })
    .limit(count * 12);
  if (error) throw new Error(error.message);
  const out: DeckSample[] = [];
  for (const deck of decks ?? []) {
    if (out.length >= count) break;
    let deckText = String((deck as any).deck_text || "").trim();
    if (deckText.length < 20) {
      const { data: cards } = await admin
        .from("deck_cards")
        .select("name, qty")
        .eq("deck_id", (deck as any).id)
        .order("created_at", { ascending: true });
      if (cards?.length) {
        deckText = cards.map((c: any) => `${c.qty || 1} ${c.name}`).join("\n");
      }
    }
    if (deckText.length < 20) continue;
    out.push({
      deck_id: String((deck as any).id),
      commander: (deck as any).commander ? String((deck as any).commander) : null,
      format: String((deck as any).format || "Commander"),
      deck_text: deckText,
      title: (deck as any).title ? String((deck as any).title) : null,
      colors: Array.isArray((deck as any).colors) ? (deck as any).colors.map((v: unknown) => String(v)) : [],
    });
  }
  return out;
}

async function benchmarkCompare(decks: DeckSample[]): Promise<BenchmarkResult[]> {
  const cases: BenchmarkResult[] = [];
  const comparable = decks.slice(0, 3);
  if (comparable.length < 2) return [fail("compare_setup", "compare", "Need at least two real decks")];
  const compareInput = comparable.map((deck, index) => `Deck ${String.fromCharCode(65 + index)}: ${deck.title || deck.commander || deck.deck_id}\n${deck.deck_text}`).join("\n\n");
  const grounding = await buildDeckCompareGrounding(compareInput, comparable[0].format || "Commander");
  const labels = new Set(grounding.decks.map((deck) => deck.label));
  for (const key of ["fasterDeck", "resilientDeck", "lateGameDeck", "recoveryDeck", "explosiveDeck", "interactionDeck"] as const) {
    const winner = grounding.matrix[key];
    cases.push(labels.has(winner)
      ? ok(`compare_${key}`, "compare", winner)
      : fail(`compare_${key}`, "compare", `Winner ${winner} not found in grounded decks`, grounding));
  }
  cases.push(
    grounding.decks.every((deck) => deck.summary.includes("ramp") && deck.summary.includes("interaction"))
      ? ok("compare_summaries", "compare", grounding.decks.map((deck) => deck.summary))
      : fail("compare_summaries", "compare", "Grounded deck summaries are too thin", grounding.decks),
  );
  return cases;
}

function benchmarkPlaystyle(): BenchmarkResult[] {
  const profiles = [
    {
      id: "control",
      input: {
        traits: { control: 80, aggression: 20, comboAppetite: 35, varianceTolerance: 30, interactionPref: 75, gameLengthPref: 70, budgetElasticity: 55 },
        topArchetypes: [{ label: "Control", matchPct: 82 }, { label: "Value", matchPct: 70 }],
        avoidList: [{ label: "Glass-cannon aggro", id: "aggro" }],
        profileLabel: "Control Pilot",
        formatTitle: "Commander",
      },
    },
    {
      id: "aggro",
      input: {
        traits: { control: 15, aggression: 82, comboAppetite: 18, varianceTolerance: 60, interactionPref: 28, gameLengthPref: 30, budgetElasticity: 35 },
        topArchetypes: [{ label: "Aggro", matchPct: 84 }, { label: "Tokens", matchPct: 72 }],
        avoidList: [{ label: "Slow control mirrors", id: "control" }],
        profileLabel: "Aggro Pilot",
        formatTitle: "Commander",
      },
    },
    {
      id: "hybrid",
      input: {
        traits: { control: 55, aggression: 45, comboAppetite: 62, varianceTolerance: 48, interactionPref: 58, gameLengthPref: 52, budgetElasticity: 72 },
        topArchetypes: [{ label: "Combo-Control", matchPct: 76 }, { label: "Value", matchPct: 68 }],
        avoidList: [],
        profileLabel: "Hybrid Pilot",
        formatTitle: "Pioneer",
      },
    },
  ];
  return profiles.map((profile) => {
    const grounded = buildGroundedPlaystyleProfile(profile.input as any);
    if (!grounded.profileSummary || grounded.bullets.length < 3) {
      return fail(`playstyle_${profile.id}`, "playstyle", "Profile grounding too thin", grounded);
    }
    return ok(`playstyle_${profile.id}`, "playstyle", grounded);
  });
}

async function benchmarkCardExplain(): Promise<BenchmarkResult[]> {
  const cards = [
    { id: "sol_ring", name: "Sol Ring", expected: ["ramp"] },
    { id: "swords", name: "Swords to Plowshares", expected: ["spot_removal"] },
    { id: "rhystic", name: "Rhystic Study", expected: ["draw"] },
    { id: "craterhoof", name: "Craterhoof Behemoth", expected: ["finisher"] },
  ];
  const results: BenchmarkResult[] = [];
  for (const card of cards) {
    const grounded = await buildGroundedCardExplainPacket({ name: card.name });
    const hit = card.expected.some((tag) => grounded.roleTags.includes(tag));
    results.push(hit
      ? ok(`card_${card.id}`, "card", { role: grounded.likelyRole, tags: grounded.roleTags.slice(0, 4) })
      : fail(`card_${card.id}`, "card", `Missing expected role tag ${card.expected.join(", ")}`, grounded));
  }
  return results;
}

async function benchmarkScaffold(admin: SupabaseClient): Promise<BenchmarkResult[]> {
  const scenarios = [
    {
      id: "commander_tokens_budget",
      input: {
        colors: ["G", "W"],
        format: "Commander",
        title: "Budget Tokens Shell",
        mustInclude: ["Skullclamp"],
        archetype: "tokens",
        theme: "go wide",
        vibe: "creature tokens",
        commander: "Cadira, Caller of the Small",
        budget: "budget",
        power: "casual",
        plan: "optimized",
      },
      expectedCount: 100,
      mustHave: ["Skullclamp", "Cadira, Caller of the Small"],
    },
    {
      id: "modern_artifacts",
      input: {
        colors: ["U", "R"],
        format: "Modern",
        title: "Artifacts Tempo",
        mustInclude: ["Emry, Lurker of the Loch"],
        archetype: "artifacts",
        theme: "artifact engine",
        vibe: "cheap artifacts value",
        commander: null,
        budget: "moderate",
        power: "focused",
        plan: "optimized",
      },
      expectedCount: 60,
      mustHave: ["Emry, Lurker of the Loch"],
    },
  ];
  const results: BenchmarkResult[] = [];
  for (const scenario of scenarios) {
    const built = await buildGroundedScaffoldDeck(admin, scenario.input as any, { userId: "bench", isPro: true, isGuest: false });
    const total = built.decklist.reduce((sum, row) => sum + row.qty, 0);
    const hasMusts = scenario.mustHave.every((name) => built.decklist.some((row) => norm(row.name) === norm(name)));
    if (total < scenario.expectedCount || !hasMusts) {
      results.push(fail(`scaffold_${scenario.id}`, "scaffold", `Count ${total} or must-includes missing`, built.decklist.slice(0, 20)));
      continue;
    }
    results.push(ok(`scaffold_${scenario.id}`, "scaffold", {
      total,
      colors: built.colors,
      firstCards: built.decklist.slice(0, 12),
    }));
  }
  return results;
}

async function benchmarkInferAim(decks: DeckSample[]): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  for (const deck of decks.slice(0, 3)) {
    const entries = deckTextNames(deck.deck_text);
    const enriched = await enrichDeck(entries.map((entry) => ({ name: entry.name, qty: entry.count })), {
      format: (String(deck.format || "Commander") as any),
      commander: deck.commander,
    }).catch(() => []);
    const byName = new Map<string, any>();
    for (const card of enriched) {
      if (!card?.name) continue;
      const extras = card as typeof card & {
        is_instant?: boolean;
        is_sorcery?: boolean;
        is_enchantment?: boolean;
        is_artifact?: boolean;
        is_planeswalker?: boolean;
      };
      byName.set(norm(card.name), {
        name: card.name,
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        color_identity: Array.isArray(card.color_identity) ? card.color_identity : [],
        cmc: typeof card.cmc === "number" ? card.cmc : undefined,
        mana_cost: card.mana_cost,
        legalities: card.legalities || {},
        keywords: Array.isArray(card.keywords) ? card.keywords : [],
        colors: Array.isArray(card.colors) ? card.colors : [],
        is_land: typeof card.is_land === "boolean" ? card.is_land : undefined,
        is_creature: typeof card.is_creature === "boolean" ? card.is_creature : undefined,
        is_instant: typeof extras.is_instant === "boolean" ? extras.is_instant : undefined,
        is_sorcery: typeof extras.is_sorcery === "boolean" ? extras.is_sorcery : undefined,
        is_enchantment: typeof extras.is_enchantment === "boolean" ? extras.is_enchantment : undefined,
        is_artifact: typeof extras.is_artifact === "boolean" ? extras.is_artifact : undefined,
        is_planeswalker: typeof extras.is_planeswalker === "boolean" ? extras.is_planeswalker : undefined,
      });
    }
    const inferredAim = await inferDeckAim(deck.commander || null, entries, byName, null);
    const tagged = tagCards(enriched);
    const facts = buildDeckFacts(tagged, { format: (String(deck.format || "Commander") as any), commander: deck.commander });
    const synergy = buildSynergyDiagnostics(tagged, deck.commander, facts);
    const profile = buildDeckPlanProfile(facts, synergy);
    const alternatives = [profile.primaryPlan.name, profile.secondaryPlan?.name].filter(Boolean);
    if (!inferredAim && !alternatives.length) {
      results.push(fail(`infer_${deck.deck_id}`, "infer_aim", "Could not infer aim or alternatives", { title: deck.title, commander: deck.commander }));
      continue;
    }
    results.push(ok(`infer_${deck.deck_id}`, "infer_aim", {
      title: deck.title,
      inferredAim,
      primary: profile.primaryPlan,
      secondary: profile.secondaryPlan,
    }));
  }
  return results;
}

async function main() {
  loadDotEnv(".env.local");
  loadDotEnv(".env");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) throw new Error("Missing Supabase env");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const decks = await fetchRealDeckSamples(admin, 6);

  const results = [
    ...(await benchmarkCompare(decks)),
    ...benchmarkPlaystyle(),
    ...(await benchmarkCardExplain()),
    ...(await benchmarkScaffold(admin)),
    ...(await benchmarkInferAim(decks)),
  ];

  const failed = results.filter((result) => !result.passed);
  const summary = {
    ok: failed.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    byGroup: Object.fromEntries(
      [...new Set(results.map((result) => result.group))].map((group) => [
        group,
        {
          total: results.filter((result) => result.group === group).length,
          passed: results.filter((result) => result.group === group && result.passed).length,
        },
      ]),
    ),
    failedCases: failed,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[benchmark-ai-pipeline-suite] fatal", error);
  process.exitCode = 1;
});
