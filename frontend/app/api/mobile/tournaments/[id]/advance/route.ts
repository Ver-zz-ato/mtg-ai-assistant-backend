import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  createNextRoundForMode,
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
    const { data: openPods } = await admin
      .from("tournament_pods")
      .select("id")
      .eq("tournament_id", id)
      .eq("status", "pending");
    if ((openPods ?? []).length > 0) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Resolve all pods first" }, { status: 409 }), rateLimit.rateLimit);
    }
    const advanced = await createNextRoundForMode(admin, access.tournament);
    if (!advanced.ok) return withTournamentRateLimitHeaders(advanced.response, rateLimit.rateLimit);
    const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
    const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]/advance] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
