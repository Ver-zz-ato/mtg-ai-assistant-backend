import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  logTournamentEvent,
  requireTournamentAdmin,
  reseatPodsBodySchema,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "pod-reseat", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = reseatPodsBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid pod seating", details: parsed.error.flatten() }, { status: 400 }),
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
    if (access.tournament.status !== "active") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Tournament must be active" }, { status: 409 }), rateLimit.rateLimit);
    }

    const { roundId, assignments } = parsed.data;
    const { data: round } = await admin
      .from("tournament_rounds")
      .select("*")
      .eq("id", roundId)
      .eq("tournament_id", id)
      .eq("phase", "commander_pods")
      .eq("status", "active")
      .maybeSingle();
    if (!round) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Active Commander pod round not found" }, { status: 404 }), rateLimit.rateLimit);

    const { data: pods } = await admin
      .from("tournament_pods")
      .select("*")
      .eq("round_id", roundId)
      .eq("tournament_id", id)
      .order("table_number", { ascending: true });
    const podRows = pods ?? [];
    if (!podRows.length) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "No pods to reseat" }, { status: 400 }), rateLimit.rateLimit);
    if (podRows.some((pod: any) => pod.status !== "pending")) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Pod seating locks after a pod result is reported" }, { status: 409 }), rateLimit.rateLimit);
    }

    const { data: existingEntries } = await admin
      .from("tournament_pod_entries")
      .select("*")
      .eq("round_id", roundId)
      .eq("tournament_id", id);
    const entryRows = existingEntries ?? [];
    const expectedParticipantIds = new Set(entryRows.map((entry: any) => String(entry.participant_id)));
    const assignedParticipantIds = new Set(assignments.map((assignment) => assignment.participantId));
    if (expectedParticipantIds.size !== assignedParticipantIds.size || [...expectedParticipantIds].some((participantId) => !assignedParticipantIds.has(participantId))) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Assignments must include every current pod player exactly once" }, { status: 400 }), rateLimit.rateLimit);
    }
    if (assignments.length !== assignedParticipantIds.size) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "A player can only be assigned once" }, { status: 400 }), rateLimit.rateLimit);
    }

    const validPodIds = new Set(podRows.map((pod: any) => String(pod.id)));
    if (assignments.some((assignment) => !validPodIds.has(assignment.podId))) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Unknown pod in seating plan" }, { status: 400 }), rateLimit.rateLimit);
    }
    const grouped = new Map<string, string[]>();
    for (const assignment of assignments) {
      grouped.set(assignment.podId, [...(grouped.get(assignment.podId) ?? []), assignment.participantId]);
    }
    for (const pod of podRows as any[]) {
      const size = grouped.get(String(pod.id))?.length ?? 0;
      if (size < 3 || size > 4) {
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Commander pods must have 3 or 4 players" }, { status: 400 }), rateLimit.rateLimit);
      }
    }

    const now = new Date().toISOString();
    const entryByParticipantId = new Map(entryRows.map((entry: any) => [String(entry.participant_id), entry]));
    for (let index = 0; index < entryRows.length; index += 1) {
      const entry = entryRows[index] as any;
      const { error: tempSeatError } = await admin
        .from("tournament_pod_entries")
        .update({ seat_number: 1000 + index, updated_at: now })
        .eq("id", entry.id)
        .eq("tournament_id", id)
        .eq("round_id", roundId);
      if (tempSeatError) {
        console.error("[mobile/tournaments/pods/reseat] temp seat update failed", tempSeatError);
        return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to save pod seating" }, { status: 500 }), rateLimit.rateLimit);
      }
    }
    for (const pod of podRows as any[]) {
      const participants = grouped.get(String(pod.id)) ?? [];
      for (let index = 0; index < participants.length; index += 1) {
        const participantId = participants[index]!;
        const entry = entryByParticipantId.get(participantId);
        const { error: updateError } = await admin
          .from("tournament_pod_entries")
          .update({
            pod_id: pod.id,
            seat_number: index + 1,
            points: 0,
            placement: null,
            dropped: false,
            updated_at: now,
          })
          .eq("id", entry.id)
          .eq("tournament_id", id)
          .eq("round_id", roundId);
        if (updateError) {
          console.error("[mobile/tournaments/pods/reseat] entry update failed", updateError);
          return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to save pod seating" }, { status: 500 }), rateLimit.rateLimit);
        }
      }
    }

    await logTournamentEvent(admin, {
      tournamentId: id,
      eventType: "pod_seating_updated",
      actor: actor.actor,
      payload: { roundId },
    });

    const { data: fresh } = await admin.from("tournaments").select("*").eq("id", id).single();
    const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/pods/reseat] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
