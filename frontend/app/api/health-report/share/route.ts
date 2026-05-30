import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";

export const runtime = "nodejs";
const MAX_SNAPSHOT_BYTES = 200_000;

/**
 * POST /api/health-report/share
 * Body: { deckId?: string, snapshotJson: object }
 * Saves a persisted snapshot for permalink / QR.
 */
export async function POST(req: NextRequest) {
  try {
    if (!sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
    }
    const { supabase, user, authError } = await getUserAndSupabase(req);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const burst = checkRateLimit(req, {
      windowMs: 10 * 60 * 1000,
      maxRequests: 10,
      keyGenerator: (request) => `health-report-share:${user.id}:${extractIP(request)}`,
    });
    if (!burst.allowed) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 }),
        burst,
      );
    }

    const body = await req.json().catch(() => ({}));
    const deckId = typeof body?.deckId === "string" ? body.deckId.trim() : null;
    const snapshotJson = body?.snapshotJson;
    if (!snapshotJson || typeof snapshotJson !== "object") {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "snapshotJson required" }, { status: 400 }),
        burst,
      );
    }
    if (JSON.stringify(snapshotJson).length > MAX_SNAPSHOT_BYTES) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "snapshot_too_large" }, { status: 400 }),
        burst,
      );
    }

    if (deckId) {
      const { data: deck } = await supabase.from("decks").select("user_id").eq("id", deckId).maybeSingle();
      if (!deck || (deck as { user_id: string }).user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 403 });
      }
    }

    const { data: row, error } = await supabase
      .from("shared_health_reports")
      .insert({
        user_id: user.id,
        deck_id: deckId || null,
        snapshot_json: snapshotJson,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (error || !row) {
      console.error("health_share_insert", error);
      return NextResponse.json({ ok: false, error: "Failed to save snapshot" }, { status: 500 });
    }

    return addRateLimitHeaders(NextResponse.json({ ok: true, id: (row as { id: string }).id }), burst);
  } catch (e: unknown) {
    console.error("health_share_route", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
