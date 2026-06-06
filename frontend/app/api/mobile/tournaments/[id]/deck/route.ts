import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  findParticipantForActor,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  requireTournamentAdmin,
  resolveTournamentDeckSubmission,
  updateTournamentDeckBodySchema,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "deck", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = updateTournamentDeckBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid deck submission", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }

    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (access.tournament.status !== "registration") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Decklists lock when the tournament starts" }, { status: 409 }), rateLimit.rateLimit);
    }

    const targetParticipantId = parsed.data.participantId ?? access.participant?.id;
    if (!targetParticipantId) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Join before submitting a deck" }, { status: 409 }), rateLimit.rateLimit);
    }
    let participant = access.participant;
    if (targetParticipantId !== access.participant?.id) {
      if (!access.isHost) {
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 }), rateLimit.rateLimit);
      }
      const { data } = await admin
        .from("tournament_participants")
        .select("*")
        .eq("id", targetParticipantId)
        .eq("tournament_id", id)
        .maybeSingle();
      participant = data as any;
    }
    if (!participant) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Participant not found" }, { status: 404 }), rateLimit.rateLimit);
    }

    const deckSubmission = await resolveTournamentDeckSubmission(admin, access.tournament, actor.actor, parsed.data);
    if (!deckSubmission.ok) return withTournamentRateLimitHeaders(deckSubmission.response, rateLimit.rateLimit);

    const { error } = await admin
      .from("tournament_participants")
      .update(deckSubmission.deck)
      .eq("id", participant.id)
      .eq("tournament_id", id);
    if (error) {
      console.error("[mobile/tournaments/[id]/deck] update failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to save decklist" }, { status: 500 }), rateLimit.rateLimit);
    }

    const freshParticipant = await findParticipantForActor(admin, id, actor.actor);
    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot, participant: freshParticipant }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]/deck] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
