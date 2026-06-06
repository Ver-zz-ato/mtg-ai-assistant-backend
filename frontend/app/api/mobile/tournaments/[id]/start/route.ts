import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  createInitialRoundForMode,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  logTournamentEvent,
  requireTournamentAdmin,
  tournamentMode,
  tournamentDeckSubmissionMode,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "start", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }), rateLimit.rateLimit);
    if (access.tournament.status !== "registration") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Tournament already started" }, { status: 409 }), rateLimit.rateLimit);
    }
    const { count } = await admin.from("tournament_participants").select("id", { count: "exact", head: true }).eq("tournament_id", id);
    const mode = tournamentMode(access.tournament);
    const minimumPlayers = mode === "commander_pods" ? 3 : 2;
    if ((count ?? 0) < minimumPlayers) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: mode === "commander_pods" ? "Commander pods need at least three players" : "At least two players are needed" }, { status: 400 }), rateLimit.rateLimit);
    }
    if (mode === "round_robin" && (count ?? 0) > 16) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Round Robin is capped at 16 players" }, { status: 400 }), rateLimit.rateLimit);
    }
    if (tournamentDeckSubmissionMode(access.tournament) === "required") {
      const { count: missingDecks } = await admin
        .from("tournament_participants")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", id)
        .is("dropped_at", null)
        .eq("deck_source", "none");
      if ((missingDecks ?? 0) > 0) {
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "All active players need decklists before starting" }, { status: 409 }), rateLimit.rateLimit);
      }
    }
    const created = await createInitialRoundForMode(admin, access.tournament);
    if (!created.ok) return withTournamentRateLimitHeaders(created.response, rateLimit.rateLimit);
    await logTournamentEvent(admin, {
      tournamentId: id,
      eventType: "tournament_started",
      actor: actor.actor,
      payload: { mode },
    });
    const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
    const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]/start] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
