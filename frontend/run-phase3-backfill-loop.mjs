/**
 * Phase 3 cron resumable loop — run until the table is exhausted or a safety/stop rule fires.
 *
 * Usage: node run-phase3-backfill-loop.mjs
 * Loads CRON_KEY and Supabase from .env.local in this directory.
 *
 * Completion: API returns no_rows_needing_backfill AND nextAfter did not advance (same as input
 * cursor) → end of table / nothing left to scan. Mid-table “empty window” advances nextAfter —
 * we continue instead of stopping.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const p = join(__dirname, ".env.local");
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

/** Only when we had candidates to merge but merged none (stuck / bracketed / mismatch). */
const MERGE_ZERO_STOP = 5;
/** Hard safety only — normal completion uses cursor / no_rows / merge-zero rules. */
const MAX_ROUNDS = 10_000_000;

const CRON_KEY = process.env.CRON_KEY || "";
const BASE = "http://localhost:3000/api/cron/scryfall-cache-phase3-backfill";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  const cnt = async (q) => {
    const r = await q();
    if (r.error) throw r.error;
    return r.count;
  };
  const total_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true })
  );
  const rows_with_legalities = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).not("legalities", "is", null)
  );
  const rows_with_keywords = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).not("keywords", "is", null)
  );
  const rows_with_colors = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).not("colors", "is", null)
  );
  const rows_with_power = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).not("power", "is", null)
  );
  const rows_with_toughness = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).not("toughness", "is", null)
  );
  const rows_with_loyalty = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).not("loyalty", "is", null)
  );
  const land_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).eq("is_land", true)
  );
  const creature_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).eq("is_creature", true)
  );
  const instant_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).eq("is_instant", true)
  );
  const sorcery_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).eq("is_sorcery", true)
  );
  const enchantment_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).eq("is_enchantment", true)
  );
  const artifact_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).eq("is_artifact", true)
  );
  const planeswalker_rows = await cnt(() =>
    supabase.from("scryfall_cache").select("*", { count: "exact", head: true }).eq("is_planeswalker", true)
  );
  return {
    total_rows,
    rows_with_legalities,
    rows_with_keywords,
    rows_with_colors,
    rows_with_power,
    rows_with_toughness,
    rows_with_loyalty,
    land_rows,
    creature_rows,
    instant_rows,
    sorcery_rows,
    enchantment_rows,
    artifact_rows,
    planeswalker_rows,
  };
}

/** Resume: latest nextAfter from last completed loop (update when starting a new machine/session). */
let after = "shield of the realm";
/** Last N rounds only — full runs can be huge. */
const rounds = [];
const RECENT_CAP = 100;
function rememberRound(entry) {
  rounds.push(entry);
  if (rounds.length > RECENT_CAP) rounds.shift();
}
const seenAfter = new Set();
let mergedZeroStreak = 0;
let baselineTotal = null;
let stopReason = "";
let finalNextAfter = after;
let totalRoundsExecuted = 0;
let firstVerifyGlobal = null;
let lastVerifyGlobal = null;
function recordVerifySnapshot(v) {
  if (firstVerifyGlobal === null) firstVerifyGlobal = { ...v };
  lastVerifyGlobal = { ...v };
}

for (let round = 1; round <= MAX_ROUNDS; round++) {
  totalRoundsExecuted = round;
  const url = `${BASE}?batchSize=75&maxPages=25&after=${encodeURIComponent(after)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-cron-key": CRON_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const status = res.status;
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }

  if (status !== 200) {
    stopReason = `HTTP status ${status}`;
    rememberRound({ round, cursor: after, status, error: true });
    break;
  }
  if (json.ok !== true) {
    stopReason = `ok is not true: ${JSON.stringify(json)}`;
    rememberRound({
      round,
      cursor: after,
      status,
      merged: json.merged,
      notFoundIdentifiers: json.notFoundIdentifiers,
      nextAfter: json.nextAfter,
      error: true,
    });
    break;
  }

  if (json.message === "no_rows_needing_backfill_in_scan_range") {
    const next = json.nextAfter != null && json.nextAfter !== "" ? String(json.nextAfter) : String(after);
    finalNextAfter = next;

    if (next === String(after)) {
      stopReason =
        "complete: no Phase 3 candidates in range and cursor did not advance (end of table or all rows satisfied in scan)";
      rememberRound({
        round,
        cursor: after,
        status,
        merged: json.merged ?? 0,
        notFoundIdentifiers: json.notFoundIdentifiers,
        nextAfter: next,
        message: json.message,
      });
      break;
    }

    rememberRound({
      round,
      cursor: after,
      status,
      candidates: 0,
      merged: 0,
      notFoundIdentifiers: json.notFoundIdentifiers ?? 0,
      nextAfter: next,
      message: json.message,
    });

    if (seenAfter.has(next)) {
      stopReason = `nextAfter repeated: ${next}`;
      break;
    }
    seenAfter.add(next);

    mergedZeroStreak = 0;

    const v = await verify();
    if (baselineTotal === null) baselineTotal = v.total_rows;
    if (v.total_rows !== baselineTotal) {
      stopReason = `total_rows changed unexpectedly: baseline ${baselineTotal}, now ${v.total_rows}`;
      break;
    }
    recordVerifySnapshot(v);

    after = next;
    continue;
  }

  if (json.nextAfter == null || json.nextAfter === "") {
    stopReason = "nextAfter missing";
    break;
  }
  if (seenAfter.has(json.nextAfter)) {
    stopReason = `nextAfter repeated: ${json.nextAfter}`;
    finalNextAfter = json.nextAfter;
    rememberRound({
      round,
      cursor: after,
      status,
      candidates: json.candidates,
      merged: json.merged,
      notFoundIdentifiers: json.notFoundIdentifiers,
      nextAfter: json.nextAfter,
    });
    break;
  }
  seenAfter.add(json.nextAfter);

  const v = await verify();
  if (baselineTotal === null) baselineTotal = v.total_rows;
  if (v.total_rows !== baselineTotal) {
    stopReason = `total_rows changed unexpectedly: baseline ${baselineTotal}, now ${v.total_rows}`;
    rememberRound({
      round,
      cursor: after,
      status,
      candidates: json.candidates,
      merged: json.merged,
      notFoundIdentifiers: json.notFoundIdentifiers,
      nextAfter: json.nextAfter,
    });
    break;
  }
  recordVerifySnapshot(v);

  const roundMeta = {
    round,
    cursor: after,
    status,
    candidates: json.candidates,
    merged: json.merged,
    duplicatePkInBatch: json.duplicatePkInBatch,
    skippedMismatch: json.skippedMismatch,
    notFoundIdentifiers: json.notFoundIdentifiers,
    scryfallCardsReturned: json.scryfallCardsReturned,
    scannedPages: json.scannedPages,
    nextAfter: json.nextAfter,
    verify: v,
  };

  const c = Number(json.candidates ?? 0);
  if (c > 0 && json.merged === 0) mergedZeroStreak++;
  else mergedZeroStreak = 0;

  if (mergedZeroStreak >= MERGE_ZERO_STOP) {
    stopReason = `merged = 0 for ${MERGE_ZERO_STOP} consecutive rounds while candidates > 0`;
    rememberRound(roundMeta);
    finalNextAfter = json.nextAfter;
    break;
  }

  rememberRound(roundMeta);
  finalNextAfter = json.nextAfter;
  after = json.nextAfter;

  if (round === MAX_ROUNDS) {
    stopReason = `${MAX_ROUNDS} rounds (safety cap) reached`;
    break;
  }
}

const net = {};
if (firstVerifyGlobal && lastVerifyGlobal) {
  for (const k of Object.keys(firstVerifyGlobal)) {
    if (k === "total_rows") continue;
    net[k] = lastVerifyGlobal[k] - firstVerifyGlobal[k];
  }
}

console.log(
  JSON.stringify(
    {
      stopReason,
      finalNextAfter,
      baselineTotal,
      totalRoundsExecuted,
      recentRoundsSampleSize: rounds.length,
      note: "rounds array is last " + RECENT_CAP + " rounds only",
      rounds: rounds.map((r) => ({
        round: r.round,
        cursor: r.cursor,
        status: r.status,
        candidates: r.candidates,
        merged: r.merged,
        notFoundIdentifiers: r.notFoundIdentifiers,
        nextAfter: r.nextAfter,
      })),
      firstVerify: firstVerifyGlobal,
      lastVerify: lastVerifyGlobal,
      netChangesExcludingTotalRows: net,
    },
    null,
    2
  )
);
