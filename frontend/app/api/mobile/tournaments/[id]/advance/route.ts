import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  createRoundAndMatches,
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
    const rateLimit = checkTournamentBurstLimit(req, "advance", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }), rateLimit.rateLimit);
    const { data: openMatches } = await admin
      .from("tournament_matches")
      .select("id")
      .eq("tournament_id", id)
      .in("status", ["pending", "reported", "disputed"]);
    if ((openMatches ?? []).length > 0) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Resolve all matches first" }, { status: 409 }), rateLimit.rateLimit);
    }
    const { data: topCutRounds } = await admin
      .from("tournament_rounds")
      .select("*")
      .eq("tournament_id", id)
      .eq("phase", "top_cut")
      .order("round_number", { ascending: false });
    if ((topCutRounds ?? []).length > 0) {
      const latestTopCut = topCutRounds![0];
      const { data: latestMatches } = await admin
        .from("tournament_matches")
        .select("*")
        .eq("round_id", latestTopCut.id)
        .order("table_number", { ascending: true });
      const winners = (latestMatches ?? []).map((m: any) => m.winner_participant_id).filter(Boolean);
      if (winners.length > 1) {
        const { data: nextRound, error: roundError } = await admin
          .from("tournament_rounds")
          .insert({
            tournament_id: id,
            round_number: Number(latestTopCut.round_number ?? 1) + 1,
            phase: "top_cut",
            status: "active",
          })
          .select("*")
          .single();
        if (roundError || !nextRound) {
          return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to create top cut round" }, { status: 500 }), rateLimit.rateLimit);
        }
        const rows = [];
        for (let i = 0; i < winners.length; i += 2) {
          if (!winners[i + 1]) break;
          rows.push({
            tournament_id: id,
            round_id: nextRound.id,
            table_number: rows.length + 1,
            player_a_id: winners[i],
            player_b_id: winners[i + 1],
            status: "pending",
          });
        }
        const { error: matchError } = await admin.from("tournament_matches").insert(rows);
        if (matchError) {
          await admin.from("tournament_rounds").delete().eq("id", nextRound.id);
          return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to create top cut matches" }, { status: 500 }), rateLimit.rateLimit);
        }
        await admin
          .from("tournaments")
          .update({ current_round: nextRound.round_number, updated_at: new Date().toISOString() })
          .eq("id", id);
        const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
        const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
      }
      await admin
        .from("tournaments")
        .update({ status: "completed", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
      const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
      const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
    }
    const swissRounds = Number(access.tournament.settings?.swissRounds ?? 3);
    const topCut = String(access.tournament.settings?.topCut ?? "none");
    const current = access.tournament.current_round;
    const nextPhase = current >= swissRounds && topCut !== "none" ? "top_cut" : "swiss";
    const nextRound = nextPhase === "top_cut" ? 1 : current + 1;
    if (current >= swissRounds && topCut === "none") {
      await admin
        .from("tournaments")
        .update({ status: "completed", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
    } else {
      const created = await createRoundAndMatches(admin, access.tournament, nextPhase, nextRound);
      if (!created.ok) return withTournamentRateLimitHeaders(created.response, rateLimit.rateLimit);
    }
    const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
    const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]/advance] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
