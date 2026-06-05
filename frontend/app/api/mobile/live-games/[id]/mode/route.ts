import { NextRequest, NextResponse } from "next/server";

import {
  checkLiveGameBurstLimit,
  ensureActiveLiveGame,
  getLiveGameAccess,
  requireLiveGameAdmin,
  requireLiveGameUser,
  serializeLiveGame,
  updateLiveGameModeBodySchema,
  withLiveGameRateLimitHeaders,
} from "@/lib/mobile/live-games";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireLiveGameUser(req);
    if (!auth.ok) return auth.response;

    const rateLimit = checkLiveGameBurstLimit(req, "mode", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;

    const parsed = updateLiveGameModeBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid mode payload", details: parsed.error.flatten() }, { status: 400 }),
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

    if (!access.isHost) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Only the host can change live game mode" }, { status: 403 }),
        rateLimit.rateLimit
      );
    }

    const { data: session, error: updateError } = await admin
      .from("live_game_sessions")
      .update({
        edit_mode: parsed.data.editMode,
        version: access.session.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", access.session.id)
      .select("*")
      .single();

    if (updateError || !session) {
      console.error("[mobile/live-games/[id]/mode] update failed", updateError);
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to update live game mode" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }

    return withLiveGameRateLimitHeaders(
      NextResponse.json({ ok: true, liveGame: serializeLiveGame(session, auth.user.id) }),
      rateLimit.rateLimit
    );
  } catch (error) {
    console.error("[mobile/live-games/[id]/mode] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
