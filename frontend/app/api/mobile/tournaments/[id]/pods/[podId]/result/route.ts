import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  logTournamentEvent,
  markPodRoundCompleteIfResolved,
  podResultBodySchema,
  requireTournamentAdmin,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; podId: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "pod-result", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = podResultBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid pod result", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id, podId } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost || actor.actor.kind !== "user") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }), rateLimit.rateLimit);
    }
    const { data: pod } = await admin.from("tournament_pods").select("*").eq("id", podId).eq("tournament_id", id).maybeSingle();
    if (!pod) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Pod not found" }, { status: 404 }), rateLimit.rateLimit);
    const { data: entries } = await admin.from("tournament_pod_entries").select("*").eq("pod_id", podId).eq("tournament_id", id);
    const entryRows = entries ?? [];
    if (!entryRows.some((entry: any) => entry.participant_id === parsed.data.winnerParticipantId)) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Winner is not in this pod" }, { status: 400 }), rateLimit.rateLimit);
    }

    const now = new Date().toISOString();
    const { error: podError } = await admin
      .from("tournament_pods")
      .update({
        status: "confirmed",
        winner_participant_id: parsed.data.winnerParticipantId,
        result_payload: { note: parsed.data.note ?? "", scoring: "winner_only" },
        updated_at: now,
      })
      .eq("id", podId)
      .eq("tournament_id", id);
    if (podError) {
      console.error("[mobile/tournaments/pod-result] pod update failed", podError);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to save pod result" }, { status: 500 }), rateLimit.rateLimit);
    }

    await Promise.all(entryRows.map((entry: any) =>
      admin
        .from("tournament_pod_entries")
        .update({
          points: entry.participant_id === parsed.data.winnerParticipantId ? 3 : 0,
          placement: entry.participant_id === parsed.data.winnerParticipantId ? 1 : null,
          updated_at: now,
        })
        .eq("id", entry.id),
    ));
    await logTournamentEvent(admin, {
      tournamentId: id,
      eventType: "pod_result",
      actor: actor.actor,
      payload: { podId, winnerParticipantId: parsed.data.winnerParticipantId },
    });
    await markPodRoundCompleteIfResolved(admin, id, String((pod as any).round_id));
    const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
    const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/pod-result] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
