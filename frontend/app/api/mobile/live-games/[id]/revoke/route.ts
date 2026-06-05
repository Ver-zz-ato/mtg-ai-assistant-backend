import { NextRequest, NextResponse } from "next/server";

import {
  checkLiveGameBurstLimit,
  ensureActiveLiveGame,
  getLiveGameAccess,
  requireLiveGameAdmin,
  requireLiveGameUser,
  serializeLiveGame,
  withLiveGameRateLimitHeaders,
} from "@/lib/mobile/live-games";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireLiveGameUser(req);
    if (!auth.ok) return auth.response;

    const rateLimit = checkLiveGameBurstLimit(req, "revoke", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;

    const { id } = await context.params;
    const admin = requireLiveGameAdmin();
    if (admin instanceof NextResponse) return admin;

    const access = await getLiveGameAccess(admin, id, auth.user.id);
    if (!access.ok) return access.response;

    const inactive = ensureActiveLiveGame(access.session);
    if (inactive) return withLiveGameRateLimitHeaders(inactive, rateLimit.rateLimit);

    if (!access.isHost) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Only the host can revoke a live game" }, { status: 403 }),
        rateLimit.rateLimit
      );
    }

    const now = new Date().toISOString();
    const [{ data: session, error: sessionError }, { error: inviteError }] = await Promise.all([
      admin
        .from("live_game_sessions")
        .update({
          status: "revoked",
          invite_revoked_at: now,
          version: access.session.version + 1,
          updated_at: now,
        })
        .eq("id", access.session.id)
        .select("*")
        .single(),
      admin
        .from("live_game_invites")
        .update({ revoked_at: now })
        .eq("live_game_id", access.session.id)
        .is("revoked_at", null),
    ]);

    if (sessionError || inviteError || !session) {
      console.error("[mobile/live-games/[id]/revoke] revoke failed", { sessionError, inviteError });
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to revoke live game" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }

    return withLiveGameRateLimitHeaders(
      NextResponse.json({ ok: true, liveGame: serializeLiveGame(session, auth.user.id) }),
      rateLimit.rateLimit
    );
  } catch (error) {
    console.error("[mobile/live-games/[id]/revoke] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
