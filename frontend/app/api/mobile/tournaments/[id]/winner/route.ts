import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  declareOverallWinnerBodySchema,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  requireTournamentAdmin,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "winner", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = declareOverallWinnerBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid winner" }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost || actor.actor.kind !== "user") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }), rateLimit.rateLimit);
    }
    if (access.tournament.status !== "completed") {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "End the tournament before declaring an overall winner" }, { status: 409 }),
        rateLimit.rateLimit,
      );
    }
    const { data: participant, error: participantError } = await admin
      .from("tournament_participants")
      .select("id, display_name, deck_name, art")
      .eq("id", parsed.data.participantId)
      .eq("tournament_id", id)
      .maybeSingle();
    if (participantError) {
      console.error("[mobile/tournaments/winner] participant lookup failed", participantError);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to check winner" }, { status: 500 }), rateLimit.rateLimit);
    }
    if (!participant) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 }), rateLimit.rateLimit);
    }

    const { data: tournament, error } = await admin
      .from("tournaments")
      .update({
        overall_winner_participant_id: participant.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !tournament) {
      console.error("[mobile/tournaments/winner] update failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to declare winner" }, { status: 500 }), rateLimit.rateLimit);
    }

    await admin.from("tournament_events").insert({
      tournament_id: id,
      actor_user_id: actor.actor.user.id,
      actor_participant_id: participant.id,
      event_type: "overall_winner_declared",
      payload: {
        participantId: participant.id,
        displayName: participant.display_name,
        deckName: participant.deck_name,
        art: participant.art,
      },
    });

    const snapshot = await loadTournamentSnapshot(admin, tournament as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/winner] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
