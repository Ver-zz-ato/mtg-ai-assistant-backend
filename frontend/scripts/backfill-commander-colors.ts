#!/usr/bin/env tsx
/**
 * Backfill commander and colors for Commander decks missing them.
 *
 * Usage:
 *   npx tsx scripts/backfill-commander-colors.ts
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 *
 * Infers commander from deck_cards or deck_text (first legendary).
 * Fetches color identity from Scryfall. Safe to run repeatedly (idempotent).
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

async function fetchCommanderAndColors(cardName: string): Promise<{ isCommander: boolean; colorIdentity: string[] }> {
  const parts = cardName.split(/\s*\/\/\s*/).map((p) => p.trim()).filter(Boolean);
  const allColors = new Set<string>();
  let isCommander = false;

  for (const part of parts) {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(part)}`);
      if (!res.ok) continue;
      const card = await res.json();
      const typeLine = (card.type_line || "").toLowerCase();
      const oracleText = (card.oracle_text || "").toLowerCase();
      const ci = Array.isArray(card.color_identity) ? card.color_identity : [];
      ci.forEach((c: string) => allColors.add(c.toUpperCase()));
      isCommander =
        isCommander ||
        typeLine.includes("legendary creature") ||
        (typeLine.includes("legendary planeswalker") && oracleText.includes("can be your commander")) ||
        oracleText.includes("can be your commander");
    } catch {
      /* skip */
    }
  }

  const wubrg = ["W", "U", "B", "R", "G"];
  return { isCommander, colorIdentity: wubrg.filter((c) => allColors.has(c)) };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);

  const { data: decksNullCommander } = await supabase
    .from("decks")
    .select("id, deck_text, commander, colors")
    .eq("format", "Commander")
    .is("commander", null)
    .not("deck_text", "is", null);

  const { data: decksNullColors } = await supabase
    .from("decks")
    .select("id, deck_text, commander, colors")
    .eq("format", "Commander")
    .not("commander", "is", null)
    .or("colors.is.null,colors.eq.{}");

  const byId = new Map<string, { id: string; deck_text: string | null; commander: string | null; colors: string[] | null }>();
  for (const d of decksNullCommander || []) {
    byId.set(d.id, { id: d.id, deck_text: d.deck_text, commander: d.commander, colors: d.colors });
  }
  for (const d of decksNullColors || []) {
    if (!byId.has(d.id)) byId.set(d.id, { id: d.id, deck_text: d.deck_text, commander: d.commander, colors: d.colors });
  }
  const decks = Array.from(byId.values());

  if (decks.length === 0) {
    console.log("No decks to backfill.");
    return;
  }

  console.log(`[Backfill] ${decks.length} decks missing commander or colors`);

  let updated = 0;
  for (const deck of decks) {
    try {
      let commander: string | null = deck.commander;
      let colors: string[] | null = Array.isArray(deck.colors) && deck.colors.length > 0 ? deck.colors : null;

      if (!commander) {
        const { data: deckCards } = await supabase
          .from("deck_cards")
          .select("name")
          .eq("deck_id", deck.id)
          .limit(100);

        const cardNames: string[] = (deckCards || []).map((c: { name: string }) => c.name);

        if (cardNames.length === 0 && deck.deck_text) {
          for (const line of deck.deck_text.split(/\r?\n/).slice(0, 25)) {
            const m = line.trim().match(/^(\d+)\s*x?\s+(.+?)\s*$/i);
            if (m) cardNames.push(m[2].trim());
          }
        }

        for (const cardName of cardNames) {
          const res = await fetchCommanderAndColors(cardName);
          if (res.isCommander) {
            commander = cardName;
            if (res.colorIdentity.length > 0) colors = res.colorIdentity;
            break;
          }
        }
        if (!commander && cardNames.length > 0) {
          commander = cardNames[0];
          const res = await fetchCommanderAndColors(commander);
          if (res.colorIdentity.length > 0) colors = res.colorIdentity;
        }
      }

      if (commander && !colors) {
        const res = await fetchCommanderAndColors(commander);
        if (res.colorIdentity.length > 0) colors = res.colorIdentity;
      }

      if (!commander && !colors) continue;

      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (commander) payload.commander = commander;
      if (colors?.length) payload.colors = colors;

      const { error } = await supabase.from("decks").update(payload).eq("id", deck.id);
      if (error) {
        console.error(`  ${deck.id}: ${error.message}`);
      } else {
        updated++;
        console.log(`  ${deck.id}: commander=${commander || deck.commander} colors=${colors?.join("") || "—"}`);
      }

      // Rate limit Scryfall
      await new Promise((r) => setTimeout(r, 100));
    } catch (err: unknown) {
      console.error(`  ${deck.id}:`, err);
    }
  }

  console.log(`[Backfill] Updated ${updated}/${decks.length} decks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
