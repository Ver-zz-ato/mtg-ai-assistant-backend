import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  dropParticipantBodySchema,
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
    const rateLimit = checkTournamentBurstLimit(req, "drop", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = dropParticipantBodySchema.safeParse(await req.json().catch(() => ({})));
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    const participantId = access.isHost ? parsed.success ? parsed.data.participantId : null : access.participant?.id;
    if (!participantId) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Participant required" }, { status: 400 }), rateLimit.rateLimit);
    }
    if (!access.isHost && participantId !== access.participant?.id) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 }), rateLimit.rateLimit);
    }
    const { error } = await admin
      .from("tournament_participants")
      .update({ dropped_at: new Date().toISOString() })
      .eq("id", participantId)
      .eq("tournament_id", id);
    if (error) {
      console.error("[mobile/tournaments/drop] update failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to drop player" }, { status: 500 }), rateLimit.rateLimit);
    }
    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/drop] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
