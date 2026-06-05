import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  markRoundCompleteIfResolved,
  reportResultBodySchema,
  requireTournamentAdmin,
  winnerFromResult,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; roundId: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "report", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = reportResultBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invalid result" }, { status: 400 }), rateLimit.rateLimit);
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id, roundId } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.participant && !access.isHost) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Join before reporting" }, { status: 403 }), rateLimit.rateLimit);
    }
    const { data: match } = await admin
      .from("tournament_matches")
      .select("*")
      .eq("id", parsed.data.matchId)
      .eq("round_id", roundId)
      .eq("tournament_id", id)
      .maybeSingle();
    if (!match) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 }), rateLimit.rateLimit);
    const participantId = access.participant?.id;
    if (!access.isHost && participantId !== match.player_a_id && participantId !== match.player_b_id) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Only match players can report" }, { status: 403 }), rateLimit.rateLimit);
    }
    const winner = winnerFromResult(match, parsed.data.result);
    const { error } = await admin
      .from("tournament_matches")
      .update({
        player_a_game_wins: parsed.data.playerAGameWins,
        player_b_game_wins: parsed.data.playerBGameWins,
        draws: parsed.data.draws,
        result: parsed.data.result,
        winner_participant_id: winner,
        status: access.isHost ? "confirmed" : "reported",
        reported_by_participant_id: participantId ?? null,
        confirmed_by_participant_id: access.isHost ? participantId ?? null : null,
        disputed_by_participant_id: null,
        host_override_by: access.isHost && actor.actor.kind === "user" ? actor.actor.user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (error) {
      console.error("[mobile/tournaments/report] update failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to report result" }, { status: 500 }), rateLimit.rateLimit);
    }
    await markRoundCompleteIfResolved(admin, id, roundId);
    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/report] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
