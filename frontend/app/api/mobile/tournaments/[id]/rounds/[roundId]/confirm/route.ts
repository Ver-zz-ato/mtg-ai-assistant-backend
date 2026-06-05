import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  confirmResultBodySchema,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  markRoundCompleteIfResolved,
  requireTournamentAdmin,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; roundId: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "confirm", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = confirmResultBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invalid confirmation" }, { status: 400 }), rateLimit.rateLimit);
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id, roundId } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    const participantId = access.participant?.id;
    if (!participantId && !access.isHost) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Join before confirming" }, { status: 403 }), rateLimit.rateLimit);
    }
    const { data: match } = await admin
      .from("tournament_matches")
      .select("*")
      .eq("id", parsed.data.matchId)
      .eq("round_id", roundId)
      .eq("tournament_id", id)
      .maybeSingle();
    if (!match) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 }), rateLimit.rateLimit);
    if (!access.isHost && participantId !== match.player_a_id && participantId !== match.player_b_id) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Only match players can confirm" }, { status: 403 }), rateLimit.rateLimit);
    }
    if (!access.isHost && match.reported_by_participant_id === participantId) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Opponent must confirm" }, { status: 403 }), rateLimit.rateLimit);
    }
    const update =
      parsed.data.action === "confirm"
        ? {
            status: "confirmed",
            confirmed_by_participant_id: participantId ?? null,
            disputed_by_participant_id: null,
            updated_at: new Date().toISOString(),
          }
        : {
            status: "disputed",
            disputed_by_participant_id: participantId ?? null,
            updated_at: new Date().toISOString(),
          };
    const { error } = await admin.from("tournament_matches").update(update).eq("id", match.id);
    if (error) {
      console.error("[mobile/tournaments/confirm] update failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to update result" }, { status: 500 }), rateLimit.rateLimit);
    }
    await markRoundCompleteIfResolved(admin, id, roundId);
    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/confirm] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
