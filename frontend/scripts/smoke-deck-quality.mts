/** One-shot: fetch full deck + previewFacts for quality review. */
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const email = process.env.PLAYWRIGHT_TEST_EMAIL || "";
  const password = process.env.PLAYWRIGHT_TEST_PASSWORD || "";
  const user = createClient(url, anon, { auth: { persistSession: false } });
  const { data: signIn, error } = await user.auth.signInWithPassword({ email, password });
  if (error || !signIn.session?.access_token || !signIn.user?.id) throw new Error("sign-in failed");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: col } = await admin
    .from("collections")
    .insert({ user_id: signIn.user.id, name: `Quality smoke ${Date.now()}` })
    .select("id")
    .single();
  if (!col?.id) throw new Error("no collection");
  await admin.from("collection_cards").insert(
    FAKE_COLLECTION.map((c) => ({ collection_id: col.id, name: c.name, qty: c.qty }))
  );
  const res = await fetch("https://www.manatap.ai/api/deck/generate-from-collection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signIn.session.access_token}`,
    },
    body: JSON.stringify({
      collectionId: col.id,
      commander: "Muldrotha, the Gravetide",
      format: "Commander",
      powerLevel: "Mid",
      budget: "Moderate",
      collectionOwnershipMode: "mostly_collection",
      generationIntent: "collection_build",
      playstyle: "Graveyard value: recur permanents with Muldrotha, sacrifice loops, mid grind.",
    }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  await admin.from("collection_cards").delete().eq("collection_id", col.id);
  await admin.from("collections").delete().eq("id", col.id);
  const outPath = path.join(process.cwd(), "scripts", "smoke-deck-quality.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ status: res.status, ...json }, null, 2)
  );
  console.log("wrote", outPath);
  console.log("previewFacts", JSON.stringify(json.previewFacts, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
