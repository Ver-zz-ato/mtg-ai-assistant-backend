/**
 * Manual / legacy cron: banned overlay only (no scryfall_cache legalities pass).
 * Primary schedule: `/api/cron/mtg-legality-refresh` (see vercel.json).
 * Streams Scryfall oracle_cards bulk once.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { refreshBannedListsOnly } from "@/lib/data/mtg-legality-refresh";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  return verifyCronRequest(req, { routePath: "/api/cron/update-banned-lists" });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runUpdateBannedLists();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runUpdateBannedLists();
}

async function runUpdateBannedLists() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  try {
    const { counts } = await refreshBannedListsOnly(admin);

    return NextResponse.json({
      ok: true,
      updated: counts,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "cron_failed";
    console.error("[update-banned-lists]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
