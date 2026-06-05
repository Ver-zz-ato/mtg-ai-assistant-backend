import { NextRequest, NextResponse } from "next/server";

import {
  checkLiveGameBurstLimit,
  getInviteTokenFromJoinBody,
  hashInviteToken,
  joinLiveGameBodySchema,
  requireLiveGameAdmin,
  requireLiveGameUser,
  serializeLiveGame,
  withLiveGameRateLimitHeaders,
} from "@/lib/mobile/live-games";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireLiveGameUser(req);
    if (!auth.ok) return auth.response;

    const rateLimit = checkLiveGameBurstLimit(req, "join", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;

    const parsed = joinLiveGameBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid invite payload", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit
      );
    }

    const token = getInviteTokenFromJoinBody(parsed.data);
    if (!token) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid invite token" }, { status: 400 }),
        rateLimit.rateLimit
      );
    }

    const admin = requireLiveGameAdmin();
    if (admin instanceof NextResponse) return admin;

    const { data: invite, error: inviteError } = await admin
      .from("live_game_invites")
      .select("id, live_game_id, expires_at, revoked_at")
      .eq("token_hash", hashInviteToken(token))
      .maybeSingle();

    if (inviteError) {
      console.error("[mobile/live-games/join] invite lookup failed", inviteError);
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }
    if (!invite) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 }),
        rateLimit.rateLimit
      );
    }

    if (invite.revoked_at) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invite was revoked" }, { status: 410 }),
        rateLimit.rateLimit
      );
    }
    if (new Date(String(invite.expires_at)).getTime() <= Date.now()) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invite expired" }, { status: 410 }),
        rateLimit.rateLimit
      );
    }

    const { data: session, error: sessionError } = await admin
      .from("live_game_sessions")
      .select("*")
      .eq("id", invite.live_game_id)
      .maybeSingle();

    if (sessionError) {
      console.error("[mobile/live-games/join] session lookup failed", sessionError);
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }
    if (!session) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Live game not found" }, { status: 404 }),
        rateLimit.rateLimit
      );
    }

    if (session.status === "revoked") {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Live game invite was revoked" }, { status: 410 }),
        rateLimit.rateLimit
      );
    }
    if (session.status === "ended") {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Live game has ended" }, { status: 409 }),
        rateLimit.rateLimit
      );
    }
    if (new Date(String(session.expires_at)).getTime() <= Date.now()) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Live game expired" }, { status: 410 }),
        rateLimit.rateLimit
      );
    }

    const role = session.host_user_id === auth.user.id ? "host" : "participant";
    const { error: participantError } = await admin.from("live_game_participants").upsert(
      {
        live_game_id: session.id,
        user_id: auth.user.id,
        role,
      },
      { onConflict: "live_game_id,user_id" }
    );

    if (participantError) {
      console.error("[mobile/live-games/join] participant upsert failed", participantError);
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to join live game" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }

    return withLiveGameRateLimitHeaders(
      NextResponse.json({ ok: true, liveGame: serializeLiveGame(session, auth.user.id) }),
      rateLimit.rateLimit
    );
  } catch (error) {
    console.error("[mobile/live-games/join] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
