/**
 * Live smoke: POST /api/deck/generate-from-collection with a synthetic collection.
 * Usage: npx tsx scripts/smoke-commander-from-collection-live.mts
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * PLAYWRIGHT_TEST_EMAIL, PLAYWRIGHT_TEST_PASSWORD
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
const COMMANDER = "Muldrotha, the Gravetide";

/** Synthetic graveyard/value pool — intentional mix of on-theme + staples, no chase outside list. */
const FAKE_COLLECTION: Array<{ name: string; qty: number }> = [
  { name: "Sol Ring", qty: 1 },
  { name: "Arcane Signet", qty: 1 },
  { name: "Command Tower", qty: 1 },
  { name: "Exotic Orchard", qty: 1 },
  { name: "Cultivate", qty: 1 },
  { name: "Kodama's Reach", qty: 1 },
  { name: "Farseek", qty: 1 },
  { name: "Rampant Growth", qty: 1 },
  { name: "Sakura-Tribe Elder", qty: 1 },
  { name: "Wood Elves", qty: 1 },
  { name: "Satyr Wayfinder", qty: 1 },
  { name: "Stitcher's Supplier", qty: 1 },
  { name: "Glowspore Shaman", qty: 1 },
  { name: "Millikin", qty: 1 },
  { name: "Sacrifice", qty: 1 },
  { name: "Viscera Seer", qty: 1 },
  { name: "Blood Artist", qty: 1 },
  { name: "Zulaport Cutthroat", qty: 1 },
  { name: "Gravecrawler", qty: 1 },
  { name: "Stinkweed Imp", qty: 4 },
  { name: "Golgari Grave-Troll", qty: 1 },
  { name: "Life from the Loam", qty: 1 },
  { name: "Wonder", qty: 1 },
  { name: "Victimize", qty: 1 },
  { name: "Animate Dead", qty: 1 },
  { name: "Dance of the Dead", qty: 1 },
  { name: "Reclamation Sage", qty: 1 },
  { name: "Acidic Slime", qty: 1 },
  { name: "Terastodon", qty: 1 },
  { name: "Sylvan Library", qty: 1 },
  { name: "Phyrexian Tower", qty: 1 },
  { name: "Ashnod's Altar", qty: 1 },
  { name: "Altar of Dementia", qty: 1 },
  { name: "Commander's Sphere", qty: 1 },
  { name: "Mind Stone", qty: 1 },
  { name: "Lightning Greaves", qty: 1 },
  { name: "Swiftfoot Boots", qty: 1 },
  { name: "Putrefy", qty: 1 },
  { name: "Assassin's Trophy", qty: 1 },
  { name: "Beast Within", qty: 1 },
  { name: "Generous Ent", qty: 1 },
  { name: "Muldrotha, the Gravetide", qty: 1 },
  { name: "Forest", qty: 22 },
  { name: "Swamp", qty: 14 },
  { name: "Island", qty: 6 },
  { name: "Overgrown Tomb", qty: 1 },
  { name: "Watery Grave", qty: 1 },
  { name: "Breeding Pool", qty: 1 },
  { name: "Hinterland Harbor", qty: 1 },
  { name: "Woodland Cemetery", qty: 1 },
  { name: "Drowned Catacomb", qty: 1 },
  { name: "Dreamroot Cascade", qty: 1 },
  { name: "Deathcap Glade", qty: 1 },
  { name: "Boseiju, Who Endures", qty: 1 },
  { name: "Takenuma, Abandoned Mire", qty: 1 },
];

type OwnershipMode = "mostly_collection" | "collection_only" | "best_with_missing";

function normKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function analyzeDeck(
  decklist: Array<{ name: string; qty: number }>,
  ownerKeys: Set<string>,
  commander: string
) {
  const cmdKey = normKey(commander);
  let total = 0;
  let owned = 0;
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const row of decklist) {
    const q = row.qty ?? 1;
    total += q;
    const k = normKey(row.name);
    if (ownerKeys.has(k) || k === cmdKey) owned += q;
    else if (!seen.has(k)) {
      seen.add(k);
      missing.push(row.name);
    }
  }
  return { total, owned, ownedPct: total ? Math.round((owned / total) * 100) : 0, missing, uniqueRows: decklist.length };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
  const email = process.env.PLAYWRIGHT_TEST_EMAIL || "";
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD || "";
  if (!url || !serviceKey || !email || !password) {
    throw new Error("Missing Supabase or PLAYWRIGHT_TEST_* env");
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const userClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", {
    auth: { persistSession: false },
  });

  const { data: signIn, error: signErr } = await userClient.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.session?.access_token) throw new Error(`Sign-in failed: ${signErr?.message ?? "no session"}`);
  const token = signIn.session.access_token;
  const userId = signIn.user?.id;
  if (!userId) throw new Error("No user id");

  const ownerKeys = new Set(FAKE_COLLECTION.map((c) => normKey(c.name)));
  const collectionTotal = FAKE_COLLECTION.reduce((s, c) => s + c.qty, 0);

  const { data: col, error: colErr } = await admin
    .from("collections")
    .insert({ user_id: userId, name: `Smoke CMD ${new Date().toISOString().slice(0, 16)}` })
    .select("id")
    .single();
  if (colErr || !col?.id) throw new Error(`Collection insert: ${colErr?.message ?? "no id"}`);

  const rows = FAKE_COLLECTION.map((c) => ({
    collection_id: col.id,
    name: c.name,
    qty: c.qty,
  }));
  const { error: cardsErr } = await admin.from("collection_cards").insert(rows);
  if (cardsErr) throw new Error(`Cards insert: ${cardsErr.message}`);

  const modes: OwnershipMode[] = ["mostly_collection", "collection_only"];
  const results: Record<string, unknown>[] = [];

  for (const mode of modes) {
    const started = Date.now();
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/deck/generate-from-collection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        collectionId: col.id,
        commander: COMMANDER,
        format: "Commander",
        powerLevel: "Mid",
        budget: "Moderate",
        collectionOwnershipMode: mode,
        generationIntent: "collection_build",
        playstyle: "Graveyard value: recur permanents with Muldrotha, grindy mid-power.",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const elapsed = Date.now() - started;

    const entry: Record<string, unknown> = {
      mode,
      httpStatus: res.status,
      elapsedMs: elapsed,
      ok: json.ok,
      error: json.error,
      code: json.code,
      collectionFit: json.collectionFit,
      previewFactsKeys: json.previewFacts && typeof json.previewFacts === "object" ? Object.keys(json.previewFacts as object) : null,
      plan: json.plan,
      title: json.title,
    };

    if (json.ok && Array.isArray(json.decklist)) {
      const decklist = json.decklist as Array<{ name: string; qty: number }>;
      entry.analysis = analyzeDeck(decklist, ownerKeys, COMMANDER);
      entry.deckTextHead = typeof json.deckText === "string" ? json.deckText.split("\n").slice(0, 12) : null;
      entry.deckTextTail = typeof json.deckText === "string" ? json.deckText.split("\n").slice(-8) : null;
      const fit = json.collectionFit as { ownedPercent?: number; missingCardNames?: string[] } | undefined;
      entry.fitVsLocal =
        fit && entry.analysis
          ? {
              serverOwnedPct: fit.ownedPercent,
              localOwnedPct: (entry.analysis as { ownedPct: number }).ownedPct,
              serverMissingCount: fit.missingCardNames?.length ?? 0,
              localMissingCount: (entry.analysis as { missing: string[] }).missing.length,
            }
          : null;
    }

    results.push(entry);
  }

  // cleanup
  await admin.from("collection_cards").delete().eq("collection_id", col.id);
  await admin.from("collections").delete().eq("id", col.id);

  const outPath = path.join(process.cwd(), "scripts", "smoke-commander-from-collection-live-result.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        apiBase: API_BASE,
        commander: COMMANDER,
        collectionId: col.id,
        collectionUniqueCards: FAKE_COLLECTION.length,
        collectionTotalQty: collectionTotal,
        results,
      },
      null,
      2
    )
  );
  console.log("Wrote", outPath);
  for (const r of results) {
    console.log("\n---", r.mode, "---");
    console.log("status", r.httpStatus, "ok", r.ok, "ms", r.elapsedMs);
    if (r.error) console.log("error", r.error);
    if (r.collectionFit) console.log("collectionFit", JSON.stringify(r.collectionFit));
    if (r.analysis) console.log("analysis", JSON.stringify(r.analysis));
    if (r.fitVsLocal) console.log("fitVsLocal", JSON.stringify(r.fitVsLocal));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
