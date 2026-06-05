import { NextRequest, NextResponse } from "next/server";

import {
  checkLiveGameBurstLimit,
  ensureActiveLiveGame,
  getLiveGameAccess,
  hasPlayerNameChanges,
  requireLiveGameAdmin,
  requireLiveGameUser,
  serializeLiveGame,
  updateLiveGameBodySchema,
  withLiveGameRateLimitHeaders,
} from "@/lib/mobile/live-games";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireLiveGameUser(req);
    if (!auth.ok) return auth.response;

    const rateLimit = checkLiveGameBurstLimit(req, "update", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;

    const parsed = updateLiveGameBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid live game payload", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit
      );
    }

    const { id } = await context.params;
    const admin = requireLiveGameAdmin();
    if (admin instanceof NextResponse) return admin;

    const access = await getLiveGameAccess(admin, id, auth.user.id);
    if (!access.ok) return access.response;

    const inactive = ensureActiveLiveGame(access.session);
    if (inactive) return withLiveGameRateLimitHeaders(inactive, rateLimit.rateLimit);

    if (!access.canEdit) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Live game is view only" }, { status: 403 }),
        rateLimit.rateLimit
      );
    }

    if (!access.isHost && hasPlayerNameChanges(access.session.state, parsed.data.state)) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Only the host can rename players" }, { status: 403 }),
        rateLimit.rateLimit
      );
    }

    const nextVersion = access.session.version + 1;
    const { data: session, error: updateError } = await admin
      .from("live_game_sessions")
      .update({
        state: parsed.data.state,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", access.session.id)
      .select("*")
      .single();

    if (updateError || !session) {
      console.error("[mobile/live-games/[id]] update failed", updateError);
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to update live game" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }

    return withLiveGameRateLimitHeaders(
      NextResponse.json({ ok: true, liveGame: serializeLiveGame(session, auth.user.id) }),
      rateLimit.rateLimit
    );
  } catch (error) {
    console.error("[mobile/live-games/[id]] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
