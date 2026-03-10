#!/usr/bin/env tsx
/**
 * Triple-check all Commander decks: validate deck content and commander correctness.
 *
 * For each deck:
 * 1) Load deck_cards (or parse deck_text)
 * 2) Check if commander is in the deck (case-insensitive)
 * 3) Check via Scryfall if commander is valid (legendary/commander-legal)
 * 4) Report issues; optionally fix (--fix)
 *
 * Usage: npx tsx scripts/triple-check-commanders.ts [--fix]
 * Env: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
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

const DO_FIX = process.argv.includes("--fix");

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

async function scryfallIsCommander(cardName: string): Promise<boolean> {
  const part = (cardName || "").split(/\s*\/\/\s*/)[0]?.trim();
  const clean = part?.replace(/\s*\([^)]*\)\s*\d*.*$/, "").replace(/\s*\[.*?\]\s*$/, "").trim() || "";
  if (!clean || clean.length < 2) return false;
  try {
    let res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(clean)}`);
    if (!res.ok) res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(clean.slice(0, 50))}`);
    if (!res.ok) return false;
    const card = await res.json();
    const typeLine = (card.type_line || "").toLowerCase();
    const oracleText = (card.oracle_text || "").toLowerCase();
    return (
      typeLine.includes("legendary creature") ||
      (typeLine.includes("legendary planeswalker") && oracleText.includes("can be your commander")) ||
      oracleText.includes("can be your commander")
    );
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
    .select("id, title, commander, deck_text")
    .eq("format", "Commander");

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  const list = decks || [];
  console.log(`[Triple-check] Auditing ${list.length} Commander decks${DO_FIX ? " (--fix enabled)" : ""}\n`);

  const issues: Array<{ deckId: string; title: string; issue: string; commander?: string; fix?: string }> = [];

  for (let i = 0; i < list.length; i++) {
    const deck = list[i];
    const deckId = deck.id;
    const title = deck.title || deckId;

    let cardNames: string[] = [];

    const { data: deckCards } = await supabase
      .from("deck_cards")
      .select("name")
      .eq("deck_id", deckId);
    cardNames = (deckCards || []).map((r: { name: string }) => r.name);

    if (cardNames.length === 0 && deck.deck_text) {
      for (const line of (deck.deck_text || "").split(/\r?\n/).slice(0, 120)) {
        const m = line.trim().match(/^(\d+)\s*x?\s+(.+?)\s*$/i);
        if (m) cardNames.push(m[2].trim());
      }
    }

    const deckNamesNorm = new Set(cardNames.map(norm).filter(Boolean));

    if (!deck.commander) {
      issues.push({ deckId, title, issue: "No commander set" });
      continue;
    }

    const commanderNorm = norm(deck.commander);
    if (!commanderNorm) {
      issues.push({ deckId, title, issue: "Commander is empty", commander: deck.commander });
      continue;
    }

    const inDeck = deckNamesNorm.has(commanderNorm) || cardNames.some((n) => norm(n) === commanderNorm);
    if (!inDeck) {
      issues.push({
        deckId,
        title,
        issue: "Commander not in deck",
        commander: deck.commander,
        fix: "Clear commander"
      });
    }

    const isValid = await scryfallIsCommander(deck.commander);
    if (!isValid) {
      issues.push({
        deckId,
        title,
        issue: "Commander is not a legal commander (not legendary)",
        commander: deck.commander,
        fix: "Clear commander"
      });
    }

    await new Promise((r) => setTimeout(r, 80));
    if ((i + 1) % 100 === 0) process.stdout.write(`  Checked ${i + 1}/${list.length}\r`);
  }

  console.log(`\n[Triple-check] Found ${issues.length} issues:\n`);

  let fixed = 0;
  for (const it of issues) {
    const line = `${it.deckId} | "${(it.title || "").slice(0, 40)}" | ${it.issue}${it.commander ? ` | "${(it.commander || "").slice(0, 40)}"` : ""}`;
    console.log(`  ${line}`);

    if (DO_FIX && (it.issue.includes("not a legal") || it.issue.includes("not in deck") || it.issue.includes("Commander is empty"))) {
      const { error: upErr } = await supabase
        .from("decks")
        .update({ commander: null, colors: [], updated_at: new Date().toISOString() })
        .eq("id", it.deckId);
      if (!upErr) fixed++;
    }
  }

  if (DO_FIX && fixed > 0) {
    console.log(`\n[Triple-check] Fixed ${fixed} decks`);
  } else if (issues.length > 0 && !DO_FIX) {
    console.log(`\nRun with --fix to clear invalid commanders`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
