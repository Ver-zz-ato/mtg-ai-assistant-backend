import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  logTournamentEvent,
  markPodRoundCompleteIfResolved,
  podConfirmBodySchema,
  requireTournamentAdmin,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string; podId: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "pod-confirm", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = podConfirmBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid pod confirmation", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id, podId } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    const participantId = access.participant?.id ?? null;
    if (!participantId) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Participant only" }, { status: 403 }), rateLimit.rateLimit);
    }

    const { data: pod } = await admin.from("tournament_pods").select("*").eq("id", podId).eq("tournament_id", id).maybeSingle();
    if (!pod) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Pod not found" }, { status: 404 }), rateLimit.rateLimit);
    if ((pod as any).status === "confirmed") {
      const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
      const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
    }
    const reportedWinnerId = (pod as any).reported_winner_participant_id as string | null;
    if (!reportedWinnerId) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "No reported pod result to confirm" }, { status: 400 }), rateLimit.rateLimit);
    }

    const { data: entries } = await admin.from("tournament_pod_entries").select("*").eq("pod_id", podId).eq("tournament_id", id);
    const entryRows = entries ?? [];
    const actorEntry = entryRows.find((entry: any) => entry.participant_id === participantId && !entry.dropped);
    if (!actorEntry) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Only active pod players can confirm" }, { status: 403 }), rateLimit.rateLimit);
    }
    if (participantId === reportedWinnerId && parsed.data.action === "confirm") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Winner does not need to confirm their own win" }, { status: 400 }), rateLimit.rateLimit);
    }

    const now = new Date().toISOString();
    await admin.from("tournament_pod_confirmations").upsert({
      tournament_id: id,
      round_id: (pod as any).round_id,
      pod_id: podId,
      participant_id: participantId,
      action: parsed.data.action,
      updated_at: now,
    }, { onConflict: "pod_id,participant_id" });

    if (parsed.data.action === "dispute") {
      const { error: disputeError } = await admin
        .from("tournament_pods")
        .update({
          status: "disputed",
          disputed_by_participant_id: participantId,
          updated_at: now,
        })
        .eq("id", podId)
        .eq("tournament_id", id);
      if (disputeError) {
        console.error("[mobile/tournaments/pod-confirm] dispute update failed", disputeError);
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to dispute pod result" }, { status: 500 }), rateLimit.rateLimit);
      }
      await logTournamentEvent(admin, {
        tournamentId: id,
        eventType: "pod_result_disputed",
        actor: actor.actor,
        actorParticipantId: participantId,
        payload: { podId, winnerParticipantId: reportedWinnerId, tableNumber: (pod as any).table_number },
      });
    } else {
      const requiredConfirmers = entryRows
        .filter((entry: any) => !entry.dropped && entry.participant_id !== reportedWinnerId)
        .map((entry: any) => entry.participant_id);
      const { data: confirmations } = await admin
        .from("tournament_pod_confirmations")
        .select("participant_id, action")
        .eq("pod_id", podId)
        .eq("tournament_id", id);
      const confirmedIds = new Set((confirmations ?? []).filter((row: any) => row.action === "confirm").map((row: any) => row.participant_id));
      const allConfirmed = requiredConfirmers.every((requiredId: string) => confirmedIds.has(requiredId));
      if (allConfirmed) {
        const { error: confirmError } = await admin
          .from("tournament_pods")
          .update({
            status: "confirmed",
            winner_participant_id: reportedWinnerId,
            disputed_by_participant_id: null,
            confirmed_at: now,
            updated_at: now,
          })
          .eq("id", podId)
          .eq("tournament_id", id);
        if (confirmError) {
          console.error("[mobile/tournaments/pod-confirm] confirm update failed", confirmError);
          return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to confirm pod result" }, { status: 500 }), rateLimit.rateLimit);
        }
        await Promise.all(entryRows.map((entry: any) =>
          admin
            .from("tournament_pod_entries")
            .update({
              points: entry.participant_id === reportedWinnerId ? 3 : 0,
              placement: entry.participant_id === reportedWinnerId ? 1 : null,
              updated_at: now,
            })
            .eq("id", entry.id),
        ));
        await logTournamentEvent(admin, {
          tournamentId: id,
          eventType: "pod_result",
          actor: actor.actor,
          actorParticipantId: participantId,
          payload: { podId, winnerParticipantId: reportedWinnerId, tableNumber: (pod as any).table_number },
        });
        await markPodRoundCompleteIfResolved(admin, id, String((pod as any).round_id));
      }
    }

    const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
    const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/pod-confirm] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
