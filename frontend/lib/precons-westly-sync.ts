/**
 * Fetch Commander precon decklists from Westly/CommanderPrecons (GitHub) and replace precon_decks.
 * Same source as scripts/generate-precon-sql.mjs — community-maintained catalog of official WotC precons.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const WESTLY_PRECON_SOURCE =
  "https://github.com/Westly/CommanderPrecons/tree/main/precon_json";

const GITHUB_API =
  "https://api.github.com/repos/Westly/CommanderPrecons/contents/precon_json";
const RAW_BASE =
  "https://raw.githubusercontent.com/Westly/CommanderPrecons/main/precon_json";

export type WestlyPreconRow = {
  name: string;
  commander: string;
  colors: string[];
  format: string;
  deck_text: string;
  set_name: string;
  release_year: number;
};

type MoxfieldJson = {
  name?: string;
  main?: { name?: string; color_identity?: string[]; colors?: string[] };
  mainboard?: Record<string, { quantity?: number; card?: { quantity?: number } }>;
};

function parseDeckName(name: string) {
  const match = name.match(/\s*\((.+?)\)\s*$/);
  const setPart = match ? match[1] : "";
  const yearMatch = setPart.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
  const set_name =
    setPart.replace(/\s*Precon\s*Decklist\s*$/i, "").trim() || setPart || "Unknown";
  return { set_name, release_year: year };
}

function moxfieldToRow(json: MoxfieldJson): WestlyPreconRow | null {
  const { name, main, mainboard } = json;
  if (!name || !main) return null;

  const commanderName = main.name || String(main);
  const colorIdentity = main.color_identity || main.colors || [];
  const colors = Array.isArray(colorIdentity) ? colorIdentity : [];

  const { set_name, release_year } = parseDeckName(name);
  const deckName = name.replace(/\s*\(.+\)\s*$/, "").trim() || name;

  const lines: string[] = [];
  lines.push(`1 ${commanderName}`);

  if (mainboard && typeof mainboard === "object") {
    for (const [cardName, entry] of Object.entries(mainboard)) {
      const qty = entry?.quantity ?? entry?.card?.quantity ?? 1;
      if (cardName && qty > 0) {
        lines.push(`${qty} ${cardName}`);
      }
    }
  }

  const deck_text = lines.join("\n");
  if (!deck_text.trim()) return null;

  return {
    name: deckName,
    commander: commanderName,
    colors,
    format: "Commander",
    deck_text,
    set_name,
    release_year,
  };
}

async function fetchJson(url: string) {
  // eslint-disable-next-line no-restricted-globals -- external GitHub raw/API URLs
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ManaTap-precon-sync" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

export type FetchWestlyProgress = (stage: "listing" | "fetching", done: number, total: number) => void;

/**
 * Download all JSON deck files from Westly/CommanderPrecons and parse into DB rows.
 */
export async function fetchWestlyPreconRows(
  onProgress?: FetchWestlyProgress
): Promise<{ rows: WestlyPreconRow[]; fileErrors: number }> {
  const files = (await fetchJson(GITHUB_API)) as { name?: string }[];
  const jsonFiles = files.filter((f) => f.name?.endsWith(".json"));
  onProgress?.("listing", jsonFiles.length, jsonFiles.length);

  const rows: WestlyPreconRow[] = [];
  let fileErrors = 0;
  let i = 0;
  for (const file of jsonFiles) {
    i++;
    const rawUrl = `${RAW_BASE}/${encodeURIComponent(file.name!)}`;
    try {
      const json = (await fetchJson(rawUrl)) as MoxfieldJson;
      const precon = moxfieldToRow(json);
      if (!precon) {
        fileErrors++;
        continue;
      }
      rows.push(precon);
    } catch {
      fileErrors++;
    }
    onProgress?.("fetching", i, jsonFiles.length);
  }

  return { rows, fileErrors };
}

const DEFAULT_BATCH = 15;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Delete all rows in precon_decks and insert the given rows (full replace).
 */
export async function replacePreconDecks(
  admin: SupabaseClient,
  rows: WestlyPreconRow[],
  options?: { batchSize?: number }
): Promise<void> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;

  const { error: delErr } = await admin
    .from("precon_decks")
    .delete()
    .neq("id", NIL_UUID);
  if (delErr) throw new Error(`Delete precon_decks: ${delErr.message}`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error: insErr } = await admin.from("precon_decks").insert(chunk);
    if (insErr) throw new Error(`Insert precon_decks at ${i}: ${insErr.message}`);
  }
}

export async function countPreconDecks(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from("precon_decks")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}
