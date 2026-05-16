import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { runCardTagRefresh } from "@/lib/data/card-tag-refresh";

export const runtime = "nodejs";
export const maxDuration = 800;

function isAuthorized(req: NextRequest): boolean {
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const headerKey = req.headers.get("x-cron-key") || "";
  const queryKey = new URL(req.url).searchParams.get("key") || "";
  const vercelId = req.headers.get("x-vercel-id");
  return !!cronKey && (!!vercelId || headerKey === cronKey || queryKey === cronKey);
}

async function runJob() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  try {
    const summary = await runCardTagRefresh(admin);
    await admin.from("app_config").upsert(
      { key: "job:card-tag-refresh:detail", value: JSON.stringify(summary) },
      { onConflict: "key" },
    );
    return NextResponse.json({ ...summary, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "card_tag_refresh_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return runJob();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return runJob();
}
