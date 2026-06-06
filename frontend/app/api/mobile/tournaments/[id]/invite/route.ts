import { NextRequest, NextResponse } from "next/server";

import {
  buildTournamentInviteUrl,
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  hashTournamentInviteToken,
  makeTournamentInviteToken,
  requireTournamentAdmin,
  tournamentExpiresAt,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "invite-refresh", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost || actor.actor.kind !== "user") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }), rateLimit.rateLimit);
    }
    if (access.tournament.status !== "registration" && access.tournament.status !== "active") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Tournament is closed" }, { status: 409 }), rateLimit.rateLimit);
    }
    const token = makeTournamentInviteToken();
    const expiresAt = tournamentExpiresAt();
    const { error } = await admin.from("tournament_invites").insert({
      tournament_id: id,
      token_hash: hashTournamentInviteToken(token),
      created_by: actor.actor.user.id,
      expires_at: expiresAt,
    });
    if (error) {
      console.error("[mobile/tournaments/[id]/invite] create failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to create invite" }, { status: 500 }), rateLimit.rateLimit);
    }
    return withTournamentRateLimitHeaders(
      NextResponse.json({ ok: true, invite: { token, url: buildTournamentInviteUrl(token), expiresAt } }),
      rateLimit.rateLimit,
    );
  } catch (error) {
    console.error("[mobile/tournaments/[id]/invite] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
