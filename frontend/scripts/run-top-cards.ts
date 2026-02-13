#!/usr/bin/env tsx
/**
 * Populate top_cards from public Commander decks (direct Supabase, no auth).
 *
 * Usage: npx tsx scripts/run-top-cards.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Prerequisite: Public Commander decks in the database
 */

import * as fs from "fs";
import * as path from "path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvLocal();

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error("Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { getCommanderBySlug } = await import("@/lib/commanders");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: decks } = await admin
    .from("decks")
    .select("id, commander")
    .eq("is_public", true)
    .eq("format", "Commander");

  if (!decks || decks.length === 0) {
    console.log("No public Commander decks found. Add some decks first.");
    process.exit(0);
  }

  const deckIds = decks.map((d) => d.id);
  const commanderByDeck = new Map<string, string>();
  for (const d of decks) {
    const c = (d.commander as string)?.trim();
    if (c) commanderByDeck.set(d.id, c);
  }

  const { data: cards } = await admin
    .from("deck_cards")
    .select("deck_id, name")
    .in("deck_id", deckIds);

  const cardCounts: Record<string, number> = {};
  const deckIdsByCard: Record<string, Set<string>> = {};

  for (const c of cards ?? []) {
    const name = (c.name as string)?.trim();
    if (!name) continue;
    cardCounts[name] = (cardCounts[name] ?? 0) + 1;
    if (!deckIdsByCard[name]) deckIdsByCard[name] = new Set();
    deckIdsByCard[name].add(c.deck_id as string);
  }

  const top200 = Object.entries(cardCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 200);

  const slugUsed = new Map<string, number>();
  const rows: Array<{ card_name: string; slug: string; deck_count: number; commander_slugs: string[] }> = [];

  for (const [cardName, deckCount] of top200) {
    let slug = toSlug(cardName);
    const existing = slugUsed.get(slug) ?? 0;
    slugUsed.set(slug, existing + 1);
    if (existing > 0) slug = `${slug}-${existing + 1}`;

    const deckIdsForCard = deckIdsByCard[cardName] ?? new Set();
    const commanderNames = [...new Set([...deckIdsForCard].map((id) => commanderByDeck.get(id)).filter(Boolean))] as string[];
    const commanderSlugs = commanderNames
      .map((n) => getCommanderBySlug(toSlug(n))?.slug ?? toSlug(n))
      .filter(Boolean);
    const uniqueSlugs = [...new Set(commanderSlugs)].slice(0, 20);

    rows.push({
      card_name: cardName,
      slug,
      deck_count: deckCount,
      commander_slugs: uniqueSlugs,
    });
  }

  const { error } = await admin.from("top_cards").delete().neq("card_name", "");
  if (error) console.warn("Clear failed:", error.message);

  if (rows.length > 0) {
    const { error: insErr } = await admin.from("top_cards").insert(
      rows.map((r) => ({
        ...r,
        updated_at: new Date().toISOString(),
      }))
    );
    if (insErr) {
      console.error("Insert failed:", insErr.message);
      process.exit(1);
    }
  }

  console.log(`Updated top_cards: ${rows.length} cards from ${decks.length} decks`);
  if (rows.length > 0) {
    console.log("Top 5:", rows.slice(0, 5).map((r) => `${r.card_name} (${r.deck_count})`).join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
