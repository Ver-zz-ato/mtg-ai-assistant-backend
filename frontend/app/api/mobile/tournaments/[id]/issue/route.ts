import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  logTournamentEvent,
  participantIssueBodySchema,
  requireTournamentAdmin,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "issue", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = participantIssueBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invalid issue" }, { status: 400 }), rateLimit.rateLimit);
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.participant) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Join before reporting an issue" }, { status: 403 }), rateLimit.rateLimit);
    }
    await logTournamentEvent(admin, {
      tournamentId: id,
      eventType: "participant_issue",
      actor: actor.actor,
      actorParticipantId: access.participant.id,
      payload: {
        participantId: access.participant.id,
        displayName: access.participant.display_name,
        message: parsed.data.message?.trim() || "Needs host attention",
      },
    });
    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/issue] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
