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
    const { data: pod } = await admin.from("tournament_pods").select("*").eq("id", podId).eq("tournament_id", id).maybeSingle();
    if (!pod) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Pod not found" }, { status: 404 }), rateLimit.rateLimit);
    const { data: entries } = await admin.from("tournament_pod_entries").select("*").eq("pod_id", podId).eq("tournament_id", id);
    const entryRows = entries ?? [];
    if (!entryRows.some((entry: any) => entry.participant_id === parsed.data.winnerParticipantId)) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Winner is not in this pod" }, { status: 400 }), rateLimit.rateLimit);
    }
    const actorParticipantId = access.participant?.id ?? null;
    if (!access.isHost && !entryRows.some((entry: any) => entry.participant_id === actorParticipantId && !entry.dropped)) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Only pod players can report this result" }, { status: 403 }), rateLimit.rateLimit);
    }

    const now = new Date().toISOString();
    if (!access.isHost) {
      if ((pod as any).status === "confirmed") {
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Pod result is already confirmed" }, { status: 400 }), rateLimit.rateLimit);
      }
      const { error: podReportError } = await admin
        .from("tournament_pods")
        .update({
          status: "reported",
          winner_participant_id: null,
          reported_winner_participant_id: parsed.data.winnerParticipantId,
          reported_by_participant_id: actorParticipantId,
          disputed_by_participant_id: null,
          reported_at: now,
          confirmed_at: null,
          result_payload: { note: parsed.data.note ?? "", scoring: "winner_only" },
          updated_at: now,
        })
        .eq("id", podId)
        .eq("tournament_id", id);
      if (podReportError) {
        console.error("[mobile/tournaments/pod-result] pod report failed", podReportError);
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to report pod result" }, { status: 500 }), rateLimit.rateLimit);
      }
      await admin.from("tournament_pod_confirmations").delete().eq("pod_id", podId).eq("tournament_id", id);
      if (actorParticipantId && actorParticipantId !== parsed.data.winnerParticipantId) {
        await admin.from("tournament_pod_confirmations").upsert({
          tournament_id: id,
          round_id: (pod as any).round_id,
          pod_id: podId,
          participant_id: actorParticipantId,
          action: "confirm",
          updated_at: now,
        }, { onConflict: "pod_id,participant_id" });
      }
      await logTournamentEvent(admin, {
        tournamentId: id,
        eventType: "pod_result_reported",
        actor: actor.actor,
        actorParticipantId,
        payload: { podId, winnerParticipantId: parsed.data.winnerParticipantId, tableNumber: (pod as any).table_number },
      });
      const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
      const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
    }

    const { error: podError } = await admin
      .from("tournament_pods")
      .update({
        status: "confirmed",
        winner_participant_id: parsed.data.winnerParticipantId,
        reported_winner_participant_id: parsed.data.winnerParticipantId,
        reported_by_participant_id: null,
        disputed_by_participant_id: null,
        confirmed_at: now,
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
    await admin.from("tournament_pod_confirmations").delete().eq("pod_id", podId).eq("tournament_id", id);
    await logTournamentEvent(admin, {
      tournamentId: id,
      eventType: "pod_result",
      actor: actor.actor,
      payload: { podId, winnerParticipantId: parsed.data.winnerParticipantId, tableNumber: (pod as any).table_number, hostOverride: true },
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
