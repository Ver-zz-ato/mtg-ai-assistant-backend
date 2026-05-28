/**
 * Live matrix: same/different collections × playstyle quiz profiles.
 * Usage: npx tsx scripts/smoke-playstyle-collection-matrix.mts
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

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

loadDotEnv(".env.local");

const API_BASE = process.env.SMOKE_API_BASE ?? "https://www.manatap.ai";

type CardRow = { name: string; qty: number };

const MULDROTHA_POOL: CardRow[] = [
  { name: "Sol Ring", qty: 1 },
  { name: "Arcane Signet", qty: 1 },
  { name: "Command Tower", qty: 1 },
  { name: "Cultivate", qty: 1 },
  { name: "Kodama's Reach", qty: 1 },
  { name: "Farseek", qty: 1 },
  { name: "Rampant Growth", qty: 1 },
  { name: "Satyr Wayfinder", qty: 1 },
  { name: "Stitcher's Supplier", qty: 1 },
  { name: "Blood Artist", qty: 1 },
  { name: "Zulaport Cutthroat", qty: 1 },
  { name: "Gravecrawler", qty: 1 },
  { name: "Stinkweed Imp", qty: 4 },
  { name: "Life from the Loam", qty: 1 },
  { name: "Victimize", qty: 1 },
  { name: "Animate Dead", qty: 1 },
  { name: "Reclamation Sage", qty: 1 },
  { name: "Phyrexian Tower", qty: 1 },
  { name: "Ashnod's Altar", qty: 1 },
  { name: "Altar of Dementia", qty: 1 },
  { name: "Putrefy", qty: 1 },
  { name: "Assassin's Trophy", qty: 1 },
  { name: "Muldrotha, the Gravetide", qty: 1 },
  { name: "Forest", qty: 24 },
  { name: "Swamp", qty: 16 },
  { name: "Island", qty: 8 },
  { name: "Overgrown Tomb", qty: 1 },
  { name: "Watery Grave", qty: 1 },
  { name: "Breeding Pool", qty: 1 },
  { name: "Boseiju, Who Endures", qty: 1 },
];

/** Aristocrats / aggro — weak overlap with graveyard grind. */
const EDGAR_POOL: CardRow[] = [
  { name: "Sol Ring", qty: 1 },
  { name: "Arcane Signet", qty: 1 },
  { name: "Command Tower", qty: 1 },
  { name: "Exotic Orchard", qty: 1 },
  { name: "Smothering Tithe", qty: 1 },
  { name: "Swords to Plowshares", qty: 1 },
  { name: "Path to Exile", qty: 1 },
  { name: "Anguished Unmaking", qty: 1 },
  { name: "Vindicate", qty: 1 },
  { name: "Lightning Greaves", qty: 1 },
  { name: "Skullclamp", qty: 1 },
  { name: "Cordial Vampire", qty: 1 },
  { name: "Blood Artist", qty: 1 },
  { name: "Cruel Celebrant", qty: 1 },
  { name: "Ophiomancer", qty: 1 },
  { name: "Elenda, the Dusk Rose", qty: 1 },
  { name: "Yahenni, Undying Partisan", qty: 1 },
  { name: "Edgar Markov", qty: 1 },
  { name: "Indulgent Aristocrat", qty: 1 },
  { name: "Crossway Troublemakers", qty: 1 },
  { name: "Captivating Vampire", qty: 1 },
  { name: "Drana, Liberator of Malakir", qty: 1 },
  { name: "Malakir Bloodwitch", qty: 1 },
  { name: "Utter End", qty: 1 },
  { name: "Mortify", qty: 1 },
  { name: "Plains", qty: 12 },
  { name: "Swamp", qty: 12 },
  { name: "Mountain", qty: 8 },
  { name: "Godless Shrine", qty: 1 },
  { name: "Sacred Foundry", qty: 1 },
  { name: "Blood Crypt", qty: 1 },
  { name: "Isolated Chapel", qty: 1 },
  { name: "Dragonskull Summit", qty: 1 },
];

type PlaystyleCase = {
  id: string;
  generationIntent: string;
  playstyle: string;
  powerLevel: string;
  budget: string;
  notes?: string;
};

const PLAYSTYLES: PlaystyleCase[] = [
  {
    id: "graveyard_value_quiz",
    generationIntent: "quiz_build",
    powerLevel: "Mid",
    budget: "Moderate",
    playstyle:
      "Playstyle vibe: Value Engine. Quiz profile: Value Engine. Quiz answers: value, mid, moderate, graveyard, meta_safe. Output preference: Full deck. Archetype: graveyard recursion. Notes: Grind with Muldrotha loops; avoid combo infinites.",
  },
  {
    id: "chaos_aggro_quiz",
    generationIntent: "quiz_build",
    powerLevel: "Optimized",
    budget: "High",
    playstyle:
      "Playstyle vibe: Chaos Gremlin. Quiz profile: Chaos Gremlin. Quiz answers: aggro, premium, chaos, tribal, rogue_coherent. Output preference: Full deck. Archetype: fast pressure. Notes: Low curve, attack often, splashy plays.",
  },
  {
    id: "control_spells_quiz",
    generationIntent: "quiz_build",
    powerLevel: "Focused",
    budget: "High",
    playstyle:
      "Playstyle vibe: Calculated Control. Quiz profile: Calculated Control. Quiz answers: control, premium, heavy, spells, meta_safe. Output preference: Full deck. Archetype: spellslinger control. Notes: Interaction-heavy, win late with engines not combat.",
  },
  {
    id: "generic_graveyard",
    generationIntent: "collection_build",
    powerLevel: "Mid",
    budget: "Moderate",
    playstyle: "Graveyard value: recur permanents, mid grind.",
  },
];

type CollectionDef = {
  id: string;
  commander: string;
  cards: CardRow[];
};

const COLLECTIONS: CollectionDef[] = [
  { id: "muldrotha", commander: "Muldrotha, the Gravetide", cards: MULDROTHA_POOL },
  { id: "edgar", commander: "Edgar Markov", cards: EDGAR_POOL },
];

function normKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deckNameSet(decklist: Array<{ name: string; qty: number }>): Set<string> {
  return new Set(decklist.map((r) => normKey(r.name)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? Math.round((inter / union) * 100) : 0;
}

const GRAVEYARD_MARKERS = [
  "gravecrawler",
  "victimize",
  "animate dead",
  "stinkweed",
  "muldrotha",
  "life from the loam",
  "altar of dementia",
];
const AGGRO_MARKERS = ["lightning bolt", "vampire", "drana", "captivating", "malakir", "swords to plowshares"];
const CONTROL_MARKERS = ["counterspell", "cyclonic rift", "rhystic", "narset", "smothering tithe", "swords to plowshares"];

function themeScore(names: string[], markers: string[]): number {
  const blob = names.join(" ").toLowerCase();
  return markers.filter((m) => blob.includes(m)).length;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const email = process.env.PLAYWRIGHT_TEST_EMAIL || "";
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD || "";
  if (!url || !serviceKey || !email || !password) {
    throw new Error("Missing Supabase or PLAYWRIGHT_TEST_* env");
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const userClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: signIn, error: signErr } = await userClient.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.session?.access_token || !signIn.user?.id) {
    throw new Error(`Sign-in failed: ${signErr?.message ?? "no session"}`);
  }
  const token = signIn.session.access_token;
  const userId = signIn.user.id;

  const runs: Record<string, unknown>[] = [];
  const collectionIds: string[] = [];

  for (const colDef of COLLECTIONS) {
    const { data: col, error: colErr } = await admin
      .from("collections")
      .insert({ user_id: userId, name: `Matrix ${colDef.id} ${Date.now()}` })
      .select("id")
      .single();
    if (colErr || !col?.id) throw new Error(colErr?.message ?? "collection insert failed");
    collectionIds.push(col.id);
    await admin.from("collection_cards").insert(
      colDef.cards.map((c) => ({ collection_id: col.id, name: c.name, qty: c.qty }))
    );
    const ownerKeys = new Set(colDef.cards.map((c) => normKey(c.name)));

    for (const ps of PLAYSTYLES) {
      const started = Date.now();
      const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/deck/generate-from-collection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          collectionId: col.id,
          commander: colDef.commander,
          format: "Commander",
          powerLevel: ps.powerLevel,
          budget: ps.budget,
          collectionOwnershipMode: "mostly_collection",
          generationIntent: ps.generationIntent,
          playstyle: ps.playstyle,
          notes: ps.notes,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const elapsed = Date.now() - started;

      const entry: Record<string, unknown> = {
        collectionKey: colDef.id,
        commander: colDef.commander,
        playstyleId: ps.id,
        httpStatus: res.status,
        elapsedMs: elapsed,
        ok: json.ok,
        error: json.error,
        collectionFit: json.collectionFit,
        previewFacts: json.previewFacts,
        plan: json.plan,
        title: json.title,
      };

      if (json.ok && Array.isArray(json.decklist)) {
        const decklist = json.decklist as Array<{ name: string; qty: number }>;
        const names = decklist.map((r) => r.name);
        entry.uniqueCards = decklist.length;
        entry.totalQty = decklist.reduce((s, r) => s + (r.qty ?? 1), 0);
        entry.themeScores = {
          graveyard: themeScore(names, GRAVEYARD_MARKERS),
          aggro: themeScore(names, AGGRO_MARKERS),
          control: themeScore(names, CONTROL_MARKERS),
        };
        entry.sampleNonland = names
          .filter((n) => !/^(plains|island|swamp|mountain|forest)$/i.test(n.trim()))
          .slice(0, 20);
        entry.nameKeySet = [...deckNameSet(decklist)];
      }

      runs.push(entry);
      console.log(
        `[${colDef.id}/${ps.id}] ${res.status} ok=${json.ok} ${elapsed}ms`,
        json.ok ? `lands=${(json.previewFacts as { land_count?: number })?.land_count}` : json.error
      );
    }
  }

  // Pairwise Jaccard within each collection (playstyle differentiation)
  const comparisons: Record<string, unknown>[] = [];
  for (const colDef of COLLECTIONS) {
    const colRuns = runs.filter((r) => r.collectionKey === colDef.id && r.ok);
    for (let i = 0; i < colRuns.length; i++) {
      for (let j = i + 1; j < colRuns.length; j++) {
        const a = colRuns[i] as { playstyleId: string; nameKeySet: string[] };
        const b = colRuns[j] as { playstyleId: string; nameKeySet: string[] };
        const setA = new Set(a.nameKeySet ?? []);
        const setB = new Set(b.nameKeySet ?? []);
        comparisons.push({
          collection: colDef.id,
          a: a.playstyleId,
          b: b.playstyleId,
          jaccardUniquePct: jaccard(setA, setB),
        });
      }
    }
  }

  for (const cid of collectionIds) {
    await admin.from("collection_cards").delete().eq("collection_id", cid);
    await admin.from("collections").delete().eq("id", cid);
  }

  const outPath = path.join(process.cwd(), "scripts", "smoke-playstyle-collection-matrix-result.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ apiBase: API_BASE, runs, comparisons, ranAt: new Date().toISOString() }, null, 2)
  );
  console.log("\nWrote", outPath);
  console.log("\n--- Playstyle differentiation (unique card Jaccard %) ---");
  let regressionFailed = false;
  for (const c of comparisons) {
    console.log(`${c.collection}: ${c.a} vs ${c.b} => ${c.jaccardUniquePct}% overlap`);
    const opposed =
      (c.a === "chaos_aggro_quiz" && c.b === "control_spells_quiz") ||
      (c.a === "control_spells_quiz" && c.b === "chaos_aggro_quiz");
    if (opposed && (c.jaccardUniquePct as number) >= 50) {
      regressionFailed = true;
      console.error("REGRESSION: opposed playstyles should be <50% overlap");
    }
  }
  for (const r of runs) {
    if (!r.ok) continue;
    const pf = r.previewFacts as { land_count?: number } | undefined;
    const lands = pf?.land_count ?? countBasicLandSlotsFromRun(r);
    if (lands > 40) {
      regressionFailed = true;
      console.error(`REGRESSION: ${r.collectionKey}/${r.playstyleId} land_count=${lands} (max 40)`);
    }
  }
  if (regressionFailed) process.exitCode = 1;
}

function countBasicLandSlotsFromRun(run: Record<string, unknown>): number {
  const keys = (run.nameKeySet as string[] | undefined) ?? [];
  const basics = new Set([
    "plains",
    "island",
    "swamp",
    "mountain",
    "forest",
    "wastes",
    "snow-covered plains",
    "snow-covered island",
    "snow-covered swamp",
    "snow-covered mountain",
    "snow-covered forest",
  ]);
  return keys.filter((k) => basics.has(k) || k.startsWith("snow-covered ")).length;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
