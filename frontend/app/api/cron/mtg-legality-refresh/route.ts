/**
 * Cron: refresh banned_cards (app_config) + scryfall_cache legalities from Scryfall oracle_cards bulk (two passes).
 * Idempotent. On partial failure after banned write, cache may be partially updated; prior rows are never deleted.
 *
 * Schedule: see vercel.json (replaces standalone update-banned-lists cron).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import { runMtgLegalityFullRefresh } from "@/lib/data/mtg-legality-refresh";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 800;
const JOB_ID = "mtg-legality-refresh";

function isAuthorized(req: NextRequest): boolean {
  return verifyCronRequest(req, { routePath: "/api/cron/mtg-legality-refresh" });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runJob();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runJob();
}

async function runJob() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const attemptStartedAt = new Date().toISOString();
  await markAdminJobAttempt(admin, JOB_ID);

  try {
    const { banned, legalities } = await runMtgLegalityFullRefresh(admin);
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(attemptStartedAt).getTime());
    const bannedCounts = {
      Commander: banned.Commander.length,
      Modern: banned.Modern.length,
      Pioneer: banned.Pioneer.length,
      Standard: banned.Standard.length,
      Pauper: banned.Pauper.length,
      Brawl: banned.Brawl.length,
    };
    await persistAdminJobRun(admin, JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: "success",
      compactLine: `Banned lists + legalities refreshed: ${legalities.updated} cache rows updated, ${legalities.scanned} oracle cards scanned`,
      destination: "app_config.banned_cards + scryfall_cache.legalities",
      source: "Scryfall oracle_cards bulk",
      durationMs,
      counts: {
        commander_banned: bannedCounts.Commander,
        modern_banned: bannedCounts.Modern,
        pioneer_banned: bannedCounts.Pioneer,
        standard_banned: bannedCounts.Standard,
        pauper_banned: bannedCounts.Pauper,
        brawl_banned: bannedCounts.Brawl,
        oracle_cards_scanned: legalities.scanned,
        cache_rows_updated: legalities.updated,
        skipped_no_row: legalities.skippedNoRow,
        skipped_unchanged: legalities.skippedUnchanged,
      },
      labels: {
        schedule: "Weekly Sunday 02:00 UTC",
        source_feed: "Scryfall oracle_cards",
      },
    });
    return NextResponse.json({
      ok: true,
      banned: bannedCounts,
      cache_legalities: legalities,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "cron_failed";
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(attemptStartedAt).getTime());
    await persistAdminJobRun(admin, JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: false,
      runResult: "failed",
      compactLine: `Failed: ${message.slice(0, 180)}`,
      destination: "app_config.banned_cards + scryfall_cache.legalities",
      source: "Scryfall oracle_cards bulk",
      durationMs,
      lastError: message,
    }, { updateLastSuccess: false });
    console.error("[mtg-legality-refresh]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
