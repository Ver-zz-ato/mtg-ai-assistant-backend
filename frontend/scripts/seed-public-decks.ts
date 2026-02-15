#!/usr/bin/env tsx
/**
 * Seed public Commander decks from sample-decks.ts (real, playable lists).
 *
 * Usage:
 *   npx tsx scripts/seed-public-decks.ts
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 *
 * Uses a fixed seed user. Run once; idempotent by title (skips if deck with same title exists).
 */

import * as path from "path";
import * as fs from "fs";
import { config } from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

const SEED_USER_ID = "b8c7d6e5-f4a3-4210-9d00-000000000001";

function parseDeckList(deckList: string): Array<{ name: string; qty: number }> {
  const cards: Array<{ name: string; qty: number }> = [];
  const lines = deckList.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    let qty = 1;
    const first = parts[0].replace(/x$/i, "");
    if (/^\d+$/.test(first)) {
      qty = parseInt(first, 10) || 1;
      parts.shift();
    }
    const name = parts.join(" ").trim();
    if (name && qty > 0) cards.push({ name, qty });
  }
  return cards;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key);

  const { SAMPLE_DECKS } = await import("../lib/sample-decks");
  let inserted = 0;
  let skipped = 0;

  for (const deck of SAMPLE_DECKS) {
    const { data: existing } = await admin
      .from("decks")
      .select("id")
      .eq("title", deck.name)
      .eq("is_public", true)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const cards = parseDeckList(deck.deckList);
    if (cards.length < 90) {
      console.log("⊘ Skipping", deck.name, "- too few cards:", cards.length);
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const { data: newDeck, error: deckErr } = await admin
      .from("decks")
      .insert({
        user_id: SEED_USER_ID,
        title: deck.name,
        format: "Commander",
        plan: deck.description?.slice(0, 200) || null,
        colors: deck.colors,
        currency: "USD",
        deck_text: deck.deckList,
        commander: deck.commander,
        is_public: true,
        public: true,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (deckErr || !newDeck) {
      console.error("✗", deck.name, deckErr?.message ?? "insert failed");
      continue;
    }

    const deckCards = cards.map(({ name, qty }) => ({
      deck_id: newDeck.id,
      name,
      qty,
    }));
    const { error: cardsErr } = await admin.from("deck_cards").upsert(deckCards, {
      onConflict: "deck_id,name",
    });
    if (cardsErr) {
      console.error("  deck_cards error:", cardsErr.message);
    }

    inserted++;
    console.log("✓", deck.name, `(${cards.length} cards)`);
  }

  console.log("\nDone. Inserted:", inserted, "Skipped:", skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
