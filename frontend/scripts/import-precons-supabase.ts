#!/usr/bin/env npx tsx
/**
 * CLI: replace precon_decks from Westly/CommanderPrecons (same as Admin → Sync precons).
 *
 *   cd frontend
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/import-precons-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";
import {
  fetchWestlyPreconRows,
  replacePreconDecks,
  countPreconDecks,
} from "../lib/precons-westly-sync";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. node --env-file=.env.local ...)"
    );
    process.exit(1);
  }

  console.error("Fetching Westly/CommanderPrecons...");
  const { rows, fileErrors, scryfallMatched } = await fetchWestlyPreconRows((stage, done, total) => {
    if (stage === "fetching" && done % 30 === 0) {
      console.error(`  Parsed ${done}/${total}...`);
    }
  });
  console.error(
    `Parsed ${rows.length} precons (${fileErrors} file errors). Scryfall dates matched: ${scryfallMatched}.`
  );

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.error("Replacing precon_decks...");
  await replacePreconDecks(admin, rows);
  const n = await countPreconDecks(admin);
  console.error(`Done. precon_decks row count: ${n}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
