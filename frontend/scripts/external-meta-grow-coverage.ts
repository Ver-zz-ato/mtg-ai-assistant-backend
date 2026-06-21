import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import * as adaptersModule from "../lib/external-deck-meta/adapters";
import * as coverageModule from "../lib/external-deck-meta/coverage";
import * as serviceModule from "../lib/external-deck-meta/service";

const DETAIL_LIMIT = 60;
const MIN_ARCHIDEKT_DELAY_MS = 3000;
const MAX_NO_ELIGIBLE_GAIN = 3;

type Candidate = {
  commander: string;
  query: string;
  page: number;
};

function loadEnvFile(path: string) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");

const service = (serviceModule as any).default ?? serviceModule;
const coverage = (coverageModule as any).default ?? coverageModule;
const adapters = (adaptersModule as any).default ?? adaptersModule;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env vars");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const commanderKey = (name: string) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

async function exactCount(table: string, apply: (query: any) => any = (query) => query) {
  const { count, error } = await apply(admin.from(table).select("id", { count: "exact", head: true }));
  if (error) throw error;
  return count || 0;
}

async function sourceHealth() {
  const { data, error } = await admin
    .from("external_deck_sources")
    .select("source_key,enabled,discovery_enabled,cooldown_until,consecutive_failures,last_error,last_success_at,min_delay_ms,max_decks_per_run")
    .order("source_key");
  if (error) throw error;
  return data || [];
}

function sourceBlockReason(sources: any[]) {
  const archidekt = sources.find((source) => source.source_key === "archidekt");
  if (!archidekt?.enabled) return "archidekt_disabled";
  if (archidekt.cooldown_until && Date.parse(archidekt.cooldown_until) > Date.now()) return `cooldown:${archidekt.cooldown_until}`;
  if (Number(archidekt.min_delay_ms || 0) < MIN_ARCHIDEKT_DELAY_MS) return `unsafe_delay:${archidekt.min_delay_ms}`;
  return null;
}

async function existingArchidektIds(ids: string[]) {
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).map(String);
    const [decks, queue] = await Promise.all([
      admin.from("external_decks").select("external_id").eq("source_key", "archidekt").in("external_id", chunk),
      admin.from("external_deck_ingest_queue").select("external_id").eq("source_key", "archidekt").in("external_id", chunk),
    ]);
    if (decks.error) throw decks.error;
    if (queue.error) throw queue.error;
    for (const row of decks.data || []) existing.add(String(row.external_id));
    for (const row of queue.data || []) existing.add(String(row.external_id));
  }
  return existing;
}

async function queueFreshArchidektIds(ids: string[]) {
  const existing = await existingArchidektIds(ids);
  const fresh = ids.map(String).filter((id) => !existing.has(id)).slice(0, DETAIL_LIMIT);
  if (!fresh.length) return { queued: 0, fresh };

  const now = new Date().toISOString();
  const { error } = await admin.from("external_deck_ingest_queue").insert(
    fresh.map((id) => ({
      source_key: "archidekt",
      external_id: id,
      url: `https://archidekt.com/decks/${id}`,
      status: "pending",
      submitted_by: null,
      next_attempt_at: now,
      updated_at: now,
    }))
  );
  if (error) throw error;
  return { queued: fresh.length, fresh };
}

async function snapshot(label: string) {
  const report = await coverage.buildExternalCommanderCoverageReport(admin);
  const exclusions: Record<string, number> = {};
  for (const reason of ["too_few_cards", "missing_commander", "duplicate_deck_hash", "invalid_format", "parse_failure", "private_unavailable", "unsupported_source"]) {
    const count = await exactCount("external_decks", (query) => query.eq("exclusion_reason", reason));
    if (count) exclusions[reason] = count;
  }
  return {
    label,
    eligible: report.community_profile_eligible_count,
    top100: report.top100_summary,
    near: report.top100
      .filter((row: any) => row.readiness_bucket === "usable_qa")
      .map((row: any) => ({ commander: row.commander, sample: row.approved_sample_size, confidence: row.confidence_score, needed: row.needed_to_50 })),
    eligibleRows: report.top250
      .filter((row: any) => row.community_profile_eligible)
      .map((row: any) => ({ commander: row.commander, sample: row.approved_sample_size, confidence: row.confidence_score })),
    profiles: report.top250.map((row: any) => ({
      commander: row.commander,
      sample: row.approved_sample_size,
      confidence: row.confidence_score,
      bucket: row.readiness_bucket,
    })),
    exclusions,
    duePending: await exactCount("external_deck_ingest_queue", (query) =>
      query.eq("source_key", "archidekt").eq("status", "pending").lte("next_attempt_at", new Date().toISOString())
    ),
    allPending: await exactCount("external_deck_ingest_queue", (query) => query.eq("source_key", "archidekt").eq("status", "pending")),
    sources: await sourceHealth(),
    report,
  };
}

function profileFor(snap: Awaited<ReturnType<typeof snapshot>>, commander: string) {
  return snap.profiles.find((profile) => commanderKey(profile.commander) === commanderKey(commander)) || { sample: 0, confidence: 0, bucket: "missing" };
}

function diffProfiles(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
  return after.profiles
    .map((profile) => {
      const previous = before.profiles.find((row) => commanderKey(row.commander) === commanderKey(profile.commander));
      return previous
        ? {
            commander: profile.commander,
            sample_delta: profile.sample - previous.sample,
            confidence_delta: Number((profile.confidence - previous.confidence).toFixed(3)),
            before: previous,
            after: profile,
          }
        : null;
    })
    .filter(Boolean) as Array<{
    commander: string;
    sample_delta: number;
    confidence_delta: number;
    before: { sample: number; confidence: number; bucket: string };
    after: { sample: number; confidence: number; bucket: string };
  }>;
}

function defaultCandidates(): Candidate[] {
  return [
    { commander: "Korvold, Fae-Cursed King", query: "Korvold Fae-Cursed King", page: 2 },
    { commander: "Chulane, Teller of Tales", query: "Chulane Teller of Tales", page: 2 },
    { commander: "Chulane, Teller of Tales", query: "Chulane", page: 1 },
    { commander: "Pantlaza, Sun-Favored", query: "Pantlaza Sun-Favored", page: 2 },
    { commander: "Pantlaza, Sun-Favored", query: "Pantlaza", page: 1 },
    { commander: "Winota, Joiner of Forces", query: "Winota Joiner of Forces", page: 2 },
    { commander: "Winota, Joiner of Forces", query: "Winota", page: 1 },
    { commander: "Etali, Primal Conqueror // Etali, Primal Sickness", query: "Etali Primal Conqueror", page: 1 },
    { commander: "Azusa, Lost but Seeking", query: "Azusa Lost but Seeking", page: 1 },
    { commander: "Yawgmoth, Thran Physician", query: "Yawgmoth Thran Physician", page: 1 },
  ];
}

async function main() {
  const start = await snapshot("start");
  let current = start;
  let stopReason: string | null = null;
  let noEligibleGain = 0;
  const events: unknown[] = [];

  console.log("START", JSON.stringify({ eligible: start.eligible, top100: start.top100, near: start.near, duePending: start.duePending, allPending: start.allPending, sources: start.sources }, null, 2));

  for (const target of defaultCandidates()) {
    if (profileFor(current, target.commander).bucket === "eligible") continue;
    const block = sourceBlockReason(await sourceHealth());
    if (block) {
      stopReason = block;
      break;
    }
    if (noEligibleGain >= MAX_NO_ELIGIBLE_GAIN) {
      stopReason = "poor_yield_after_3_chunks";
      break;
    }

    const before = current;
    const search = await adapters.discoverArchidektCommanderSearchDecks(target.query, { page: target.page, maxIds: DETAIL_LIMIT });
    await sleep(MIN_ARCHIDEKT_DELAY_MS + 100);
    if (!search.ok) {
      stopReason = `archidekt_${search.status}:${search.error}`;
      break;
    }

    const queued = await queueFreshArchidektIds(search.ids.map(String));
    events.push({ target: target.commander, query: target.query, page: target.page, found: search.ids.length, queued: queued.queued });
    if (!queued.queued) {
      noEligibleGain += 1;
      current = await snapshot(`after_noqueue_${target.commander}`);
      continue;
    }

    const summary = await service.runExternalDeckMetaIngest(admin, { source: "archidekt", limit: DETAIL_LIMIT, discover: false });
    if (summary.errors.some((error: string) => /429|rate.?limit/i.test(error))) {
      stopReason = `rate_limit:${summary.errors.join(";")}`;
      break;
    }
    if (summary.errors.some((error: string) => /403|private_unavailable/i.test(error))) {
      stopReason = `403:${summary.errors.join(";")}`;
      break;
    }
    if (summary.errors.filter((error: string) => /fetch failed/i.test(error)).length >= 2) {
      stopReason = `repeated_fetch_failed:${summary.errors.join(";")}`;
      break;
    }

    const after = await snapshot(`after_${target.commander}`);
    const newly = after.eligibleRows.filter((row) => !before.eligibleRows.some((existing) => commanderKey(existing.commander) === commanderKey(row.commander)));
    const lost = before.eligibleRows.filter((row) => !after.eligibleRows.some((existing) => commanderKey(existing.commander) === commanderKey(row.commander)));
    const regressions = diffProfiles(before, after).filter(
      (row) => row.sample_delta < 0 || (row.before.bucket === "eligible" && row.after.bucket !== "eligible")
    );
    const result = {
      target: target.commander,
      processed: summary.processed,
      updated: summary.insertedOrUpdated,
      failed: summary.failed,
      rollups: summary.rollupsWritten,
      profiles: summary.profilesWritten,
      before: { eligible: before.eligible, target: profileFor(before, target.commander) },
      after: { eligible: after.eligible, target: profileFor(after, target.commander) },
      newly,
      lost,
      regressions,
      exclusions: after.exclusions,
      duePending: after.duePending,
      allPending: after.allPending,
      sources: after.sources,
      errors: summary.errors,
    };
    events.push(result);
    console.log("CHUNK", JSON.stringify(result, null, 2));

    if (lost.length || after.eligible < before.eligible) {
      stopReason = "material_eligible_regression";
      current = after;
      break;
    }
    if (regressions.length) {
      stopReason = "profile_regression";
      current = after;
      break;
    }

    const targetAfter = profileFor(after, target.commander);
    const targetBefore = profileFor(before, target.commander);
    const usefulProgress =
      after.eligible > before.eligible ||
      targetAfter.sample - targetBefore.sample >= 10 ||
      (targetAfter.sample >= 45 && targetAfter.confidence >= 0.5);
    noEligibleGain = usefulProgress ? 0 : noEligibleGain + 1;
    current = after;
  }

  const final = await snapshot("final");
  console.log(
    "FINAL_GROWTH_REPORT",
    JSON.stringify(
      {
        stopReason,
        startEligible: start.eligible,
        endEligible: final.eligible,
        newlyEligible: final.eligibleRows.filter((row) => !start.eligibleRows.some((existing) => commanderKey(existing.commander) === commanderKey(row.commander))),
        near: final.near,
        events,
        exclusions: final.exclusions,
        duePending: final.duePending,
        allPending: final.allPending,
        sources: final.sources,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
