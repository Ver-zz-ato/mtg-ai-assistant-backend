#!/usr/bin/env tsx
/**
 * Cleanup decks with invalid commanders.
 * 1) Pattern-based: garbage (CSV, etc.) and known non-commanders (Sol Ring, Arcane Signet, etc.)
 * 2) Scryfall validation: fetches each commander and clears if not legendary/commander-legal
 *
 * Usage: npx tsx scripts/cleanup-garbage-commanders.ts
 * Env: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import * as path from "path";
import * as fs from "fs";
import { config } from "dotenv";
import { isCommanderEligible } from "../lib/deck/deck-enrichment";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

function looksLikeGarbage(name: string): boolean {
  const n = (name || "").trim();
  if (!n) return true;
  if (n.length > 120) return true;
  if (/\[MB\]|\[%\]|\[°C\]|\[V\]|\[W\]|\[MHz\]|\[RPM\]|Temperature|Virtual Memory|GPU Core|Date,Time/i.test(n)) return true;
  if (/,{2,}/.test(n) || n.split(",").length > 3) return true;
  return false;
}

const NEVER_COMMANDERS = new Set([
  "sol ring", "arcane signet", "academy manufactor", "command tower", "thought vessel",
  "wayfarer's bauble", "chromatic lantern", "mana crypt", "mana vault", "fellwar stone",
  "navigator's compass", "mind stone", "coldsteel heart", "lightning greaves", "swamp", "island", "plains", "mountain", "forest"
]);

function isNonCommanderByName(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (NEVER_COMMANDERS.has(n)) return true;
  if (/^(sol ring|arcane signet|command tower|about)$/i.test(n)) return true;
  return false;
}

/** Check Scryfall - is this card actually a valid commander? Uses fuzzy match for shortened names. */
async function scryfallIsCommander(cardName: string): Promise<boolean> {
  const part = cardName.split(/\s*\/\/\s*/)[0]?.trim() || cardName;
  const clean = part.replace(/\s*\([^)]*\)\s*\d*.*$/, "").replace(/\s*\[.*?\]\s*$/, "").trim();
  if (!clean || clean.length < 2) return false;
  try {
    let res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(clean)}`);
    if (!res.ok) res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(clean.slice(0, 50))}`);
    if (!res.ok) return false;
    const card = await res.json();
    return isCommanderEligible(card.type_line, card.oracle_text);
  } catch {
    return false;
  }
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

  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, title, commander")
    .eq("format", "Commander")
    .not("commander", "is", null);

  if (error) {
    console.error("Error fetching decks:", error.message);
    process.exit(1);
  }

  const phase1 = (decks || []).filter(
    (d) => d.commander && (looksLikeGarbage(d.commander) || isNonCommanderByName(d.commander))
  );

  let cleaned = 0;
  if (phase1.length > 0) {
    console.log(`[Phase 1] ${phase1.length} decks with pattern-matched invalid commanders`);
    for (const deck of phase1) {
      const { error: upErr } = await supabase
        .from("decks")
        .update({ commander: null, colors: [], updated_at: new Date().toISOString() })
        .eq("id", deck.id);
      if (!upErr) {
        cleaned++;
        console.log(`  cleared: "${(deck.commander || "").slice(0, 50)}..."`);
      }
    }
  }

  const remaining = (decks || []).filter((d) => d.commander && !phase1.some((p) => p.id === d.id));
  console.log(`[Phase 2] Validating ${remaining.length} commanders via Scryfall...`);

  for (const deck of remaining) {
    const ok = await scryfallIsCommander(deck.commander!);
    if (!ok) {
      const { error: upErr } = await supabase
        .from("decks")
        .update({ commander: null, colors: [], updated_at: new Date().toISOString() })
        .eq("id", deck.id);
      if (!upErr) {
        cleaned++;
        console.log(`  cleared (not commander): "${(deck.commander || "").slice(0, 50)}..."`);
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[Cleanup] Cleared ${cleaned} decks total`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
