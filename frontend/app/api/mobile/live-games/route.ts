import { NextRequest, NextResponse } from "next/server";

import {
  buildLiveGameInviteUrl,
  checkLiveGameBurstLimit,
  createLiveGameBodySchema,
  hashInviteToken,
  isAnonymousSupabaseUser,
  liveGameExpiresAt,
  makeInviteToken,
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

    if (isAnonymousSupabaseUser(auth.user)) {
      return NextResponse.json({ ok: false, error: "Anonymous guests cannot host live games" }, { status: 403 });
    }

    const rateLimit = checkLiveGameBurstLimit(req, "create", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;

    const parsed = createLiveGameBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid live game payload", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit
      );
    }

    const admin = requireLiveGameAdmin();
    if (admin instanceof NextResponse) return admin;

    const expiresAt = liveGameExpiresAt();
    const { data: session, error: sessionError } = await admin
      .from("live_game_sessions")
      .insert({
        host_user_id: auth.user.id,
        state: parsed.data.state,
        edit_mode: parsed.data.editMode,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (sessionError || !session) {
      console.error("[mobile/live-games] create failed", sessionError);
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to create live game" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }

    const liveGameId = String(session.id);
    const inviteToken = makeInviteToken();
    const inviteUrl = buildLiveGameInviteUrl(inviteToken);

    const [{ error: participantError }, { error: inviteError }] = await Promise.all([
      admin.from("live_game_participants").insert({
        live_game_id: liveGameId,
        user_id: auth.user.id,
        role: "host",
      }),
      admin.from("live_game_invites").insert({
        live_game_id: liveGameId,
        token_hash: hashInviteToken(inviteToken),
        created_by: auth.user.id,
        expires_at: expiresAt,
      }),
    ]);

    if (participantError || inviteError) {
      console.error("[mobile/live-games] create metadata failed", { participantError, inviteError });
      await admin.from("live_game_sessions").delete().eq("id", liveGameId);
      return withLiveGameRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to create live game invite" }, { status: 500 }),
        rateLimit.rateLimit
      );
    }

    return withLiveGameRateLimitHeaders(
      NextResponse.json({
        ok: true,
        liveGame: serializeLiveGame(session, auth.user.id),
        invite: {
          token: inviteToken,
          url: inviteUrl,
          expiresAt,
        },
      }),
      rateLimit.rateLimit
    );
  } catch (error) {
    console.error("[mobile/live-games] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
