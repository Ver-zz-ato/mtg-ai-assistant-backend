/**
 * Cron: refresh banned_cards (app_config) + scryfall_cache legalities from Scryfall oracle_cards bulk (two passes).
 * Idempotent. On partial failure after banned write, cache may be partially updated; prior rows are never deleted.
 *
 * Schedule: see vercel.json (replaces standalone update-banned-lists cron).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import {
  getMtgLegalityCronSecrets,
  isMtgLegalityCronAuthorized,
} from "@/app/api/_lib/mtg-legality-cron-auth";
import { runMtgLegalityFullRefresh } from "@/lib/data/mtg-legality-refresh";

export const runtime = "nodejs";
export const maxDuration = 800;

function isAuthorized(req: NextRequest): boolean {
  const secrets = getMtgLegalityCronSecrets();
  const url = new URL(req.url);
  return isMtgLegalityCronAuthorized(secrets, {
    authorizationHeader: req.headers.get("authorization"),
    xCronKey: req.headers.get("x-cron-key"),
    queryKey: url.searchParams.get("key"),
  });
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

  try {
    const { banned, legalities } = await runMtgLegalityFullRefresh(admin);
    return NextResponse.json({
      ok: true,
      banned: {
        Commander: banned.Commander.length,
        Modern: banned.Modern.length,
        Pioneer: banned.Pioneer.length,
        Standard: banned.Standard.length,
        Pauper: banned.Pauper.length,
        Brawl: banned.Brawl.length,
      },
      cache_legalities: legalities,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "cron_failed";
    console.error("[mtg-legality-refresh]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
