import { NextRequest, NextResponse } from "next/server";

import {
  buildTournamentInviteUrl,
  checkTournamentBurstLimit,
  createTournamentBodySchema,
  hashTournamentInviteToken,
  loadTournamentSnapshot,
  makeTournamentInviteToken,
  requireTournamentAdmin,
  requireTournamentUser,
  tournamentExpiresAt,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTournamentUser(req);
    if (!auth.ok) return auth.response;
    const rateLimit = checkTournamentBurstLimit(req, "list", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const [{ data: hosted }, { data: participantRows }] = await Promise.all([
      admin
        .from("tournaments")
        .select("id, title, format, mode, status, current_round, created_at, updated_at")
        .eq("host_user_id", auth.user.id)
        .order("updated_at", { ascending: false })
        .limit(30),
      admin
        .from("tournament_participants")
        .select("tournament_id")
        .eq("user_id", auth.user.id)
        .order("joined_at", { ascending: false })
        .limit(30),
    ]);
    const hostedIds = (hosted ?? []).map((row: any) => row.id).filter(Boolean);
    const { data: hostedParticipantRows } =
      hostedIds.length > 0
        ? await admin
            .from("tournament_participants")
            .select("tournament_id, display_name, joined_at, dropped_at")
            .in("tournament_id", hostedIds)
            .order("joined_at", { ascending: true })
        : { data: [] };
    const participantsByTournament = new Map<string, any[]>();
    for (const row of hostedParticipantRows ?? []) {
      const tournamentId = String((row as any).tournament_id);
      const rows = participantsByTournament.get(tournamentId) ?? [];
      rows.push(row);
      participantsByTournament.set(tournamentId, rows);
    }
    const hostedWithParticipants = (hosted ?? []).map((row: any) => {
      const participants = participantsByTournament.get(String(row.id)) ?? [];
      return {
        ...row,
        participant_count: participants.length,
        active_participant_count: participants.filter((participant) => !participant.dropped_at).length,
        participants_preview: participants.slice(0, 8).map((participant) => ({
          display_name: participant.display_name,
          joined_at: participant.joined_at,
          dropped: Boolean(participant.dropped_at),
        })),
      };
    });
    const joinedIds = Array.from(new Set((participantRows ?? []).map((row: any) => row.tournament_id).filter(Boolean)));
    const { data: joinedRows } =
      joinedIds.length > 0
        ? await admin
            .from("tournaments")
            .select("id, host_user_id, title, format, mode, status, current_round, created_at, updated_at")
            .in("id", joinedIds)
        : { data: [] };
    const joined = (joinedRows ?? []).filter((row: any) => row.host_user_id !== auth.user.id);
    return withTournamentRateLimitHeaders(
      NextResponse.json({ ok: true, hosted: hostedWithParticipants, joined }),
      rateLimit.rateLimit,
    );
  } catch (error) {
    console.error("[mobile/tournaments] list route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTournamentUser(req);
    if (!auth.ok) return auth.response;
    const rateLimit = checkTournamentBurstLimit(req, "create", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = createTournamentBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid tournament", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    if (parsed.data.venueId) {
      const { data: venue } = await admin
        .from("tournament_venues")
        .select("id")
        .eq("id", parsed.data.venueId)
        .eq("owner_user_id", auth.user.id)
        .maybeSingle();
      if (!venue) {
        return withTournamentRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 }),
          rateLimit.rateLimit,
        );
      }
    }
    const expiresAt = tournamentExpiresAt();
    const { data: tournament, error } = await admin
      .from("tournaments")
      .insert({
        venue_id: parsed.data.venueId ?? null,
        host_user_id: auth.user.id,
        title: parsed.data.title,
        format: parsed.data.format,
        mode: parsed.data.mode,
        settings: {
          tournamentMode: parsed.data.mode,
          playerCap: parsed.data.playerCap,
          swissRounds: parsed.data.swissRounds,
          topCut: parsed.data.topCut,
          podRounds: parsed.data.podRounds,
          roundRobinDrawsEnabled: parsed.data.roundRobinDrawsEnabled,
          decklistsEnabled: parsed.data.deckSubmissionMode ? parsed.data.deckSubmissionMode !== "off" : parsed.data.decklistsEnabled,
          deckSubmissionMode: parsed.data.deckSubmissionMode ?? (parsed.data.decklistsEnabled ? "optional" : "off"),
          deckVisibility: parsed.data.deckVisibility,
          deckLegalityCheckEnabled: parsed.data.deckLegalityCheckEnabled,
        },
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error || !tournament) {
      console.error("[mobile/tournaments] create failed", error);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to create tournament" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    const token = makeTournamentInviteToken();
    const inviteUrl = buildTournamentInviteUrl(token);
    const { error: inviteError } = await admin.from("tournament_invites").insert({
      tournament_id: tournament.id,
      token_hash: hashTournamentInviteToken(token),
      created_by: auth.user.id,
      expires_at: expiresAt,
    });
    if (inviteError) {
      console.error("[mobile/tournaments] invite failed", inviteError);
      await admin.from("tournaments").delete().eq("id", tournament.id);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to create tournament invite" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    const snapshot = await loadTournamentSnapshot(admin, tournament as any, {
      kind: "user",
      user: auth.user,
      actorKey: auth.user.id,
      guestKeyHash: null,
    });
    return withTournamentRateLimitHeaders(
      NextResponse.json({
        ok: true,
        tournament: snapshot,
        invite: { token, url: inviteUrl, expiresAt },
      }),
      rateLimit.rateLimit,
    );
  } catch (error) {
    console.error("[mobile/tournaments] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
