import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { runAppleReviewAlertCycle } from "@/lib/apple-app-store/runAppleReviewAlertCycle";
import { verifyAppReviewAlertRequest } from "@/lib/server/verifyAppReviewAlertRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseBooleanParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function handleAppleReviews(req: NextRequest) {
  const routePath = "/api/cron/apple-reviews";

  if (!verifyAppReviewAlertRequest(req, { routePath })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const dryRun =
    parseBooleanParam(req.nextUrl.searchParams.get("dryRun")) ||
    parseBooleanParam(req.headers.get("x-dry-run"));
  const forceNotify = parseBooleanParam(req.nextUrl.searchParams.get("forceNotify"));

  try {
    const result = await runAppleReviewAlertCycle(admin, { dryRun, forceNotify });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "apple_reviews_cycle_failed";
    console.error(
      JSON.stringify({
        tag: "apple_reviews_cycle_error",
        error: msg,
        timestamp: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Manual / Postman entrypoint (requested). Vercel Cron uses GET below. */
export async function POST(req: NextRequest) {
  return handleAppleReviews(req);
}

export async function GET(req: NextRequest) {
  return handleAppleReviews(req);
}
