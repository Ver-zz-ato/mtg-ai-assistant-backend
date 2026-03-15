/**
 * Cron: update banned card lists from Scryfall and store in app_config.
 * Streams Scryfall oracle_cards bulk to keep memory low.
 * Schedule: weekly (e.g. Sunday 02:00 UTC).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { fetchAndBuildBannedLists } from "@/lib/data/build-banned-lists-from-scryfall";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";
  const vercelId = req.headers.get("x-vercel-id");
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key") || "";
  return !!cronKey && (!!vercelId || hdr === cronKey || queryKey === cronKey);
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
    const banned = await fetchAndBuildBannedLists();

    const { error } = await admin.from("app_config").upsert(
      {
        key: "banned_cards",
        value: banned,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    await admin
      .from("app_config")
      .upsert(
        {
          key: "job:last:update-banned-lists",
          value: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    const counts = {
      Commander: banned.Commander.length,
      Modern: banned.Modern.length,
      Pioneer: banned.Pioneer.length,
      Standard: banned.Standard.length,
      Pauper: banned.Pauper.length,
      Brawl: banned.Brawl.length,
    };

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
