import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  markRoundCompleteIfResolved,
  overrideResultBodySchema,
  requireTournamentAdmin,
  winnerFromResult,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; matchId: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "override", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = overrideResultBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invalid override" }, { status: 400 }), rateLimit.rateLimit);
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id, matchId } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost || actor.actor.kind !== "user") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }), rateLimit.rateLimit);
    }
    const { data: match } = await admin.from("tournament_matches").select("*").eq("id", matchId).eq("tournament_id", id).maybeSingle();
    if (!match) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 }), rateLimit.rateLimit);
    const winner = winnerFromResult(match, parsed.data.result);
    const { error } = await admin
      .from("tournament_matches")
      .update({
        player_a_game_wins: parsed.data.playerAGameWins,
        player_b_game_wins: parsed.data.playerBGameWins,
        draws: parsed.data.draws,
        result: parsed.data.result,
        winner_participant_id: winner,
        status: "confirmed",
        host_override_by: actor.actor.user.id,
        disputed_by_participant_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (error) {
      console.error("[mobile/tournaments/override] update failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to override result" }, { status: 500 }), rateLimit.rateLimit);
    }
    await admin.from("tournament_events").insert({
      tournament_id: id,
      actor_user_id: actor.actor.user.id,
      event_type: "match_override",
      payload: { matchId, note: parsed.data.note ?? "" },
    });
    await markRoundCompleteIfResolved(admin, id, match.round_id);
    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/override] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
