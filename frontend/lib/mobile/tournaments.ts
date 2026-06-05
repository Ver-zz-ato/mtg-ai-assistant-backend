import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { getServiceRoleClient } from "@/lib/server-supabase";
import {
  allRoundMatchesResolved,
  calculateStandings,
  createSwissPairings,
  createTopCutPairings,
  type TournamentMatchForStandings,
  type TournamentParticipantForPairing,
} from "@/lib/mobile/tournament-engine";

export const TOURNAMENT_INVITE_TTL_DAYS = 30;
export const TOURNAMENT_GUEST_HEADER = "X-Guest-Session-Token";
export const TOURNAMENT_MAX_PLAYERS = 128;

export const tournamentFormatSchema = z.enum(["Commander", "Standard", "Pioneer", "Modern", "Pauper", "Custom"]);
export const topCutSchema = z.enum(["none", "top4", "top8"]);

export const playerArtSchema = z
  .object({
    source: z.enum(["scryfall", "color", "none"]).default("none"),
    scryfallCardId: z.string().max(128).optional(),
    scryfallOracleId: z.string().max(128).optional(),
    imageUrl: z.string().url().max(2048).optional(),
    colorHex: z.string().max(16).optional(),
    title: z.string().max(160).optional(),
    artist: z.string().max(160).optional(),
    setCode: z.string().max(32).optional(),
  })
  .passthrough();

export const venueBodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(180).optional().default(""),
});

export const createTournamentBodySchema = z.object({
  venueId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(140),
  format: tournamentFormatSchema.default("Commander"),
  playerCap: z.number().int().min(2).max(TOURNAMENT_MAX_PLAYERS).default(32),
  swissRounds: z.number().int().min(1).max(12).default(3),
  topCut: topCutSchema.default("none"),
  decklistsEnabled: z.boolean().default(true),
});

export const joinTournamentBodySchema = z
  .object({
    token: z.string().min(20).max(256).optional(),
    inviteToken: z.string().min(20).max(256).optional(),
    inviteUrl: z.string().min(1).max(2048).optional(),
    displayName: z.string().trim().min(1).max(80),
    art: playerArtSchema.default({ source: "none" }),
    deckId: z.string().uuid().nullable().optional(),
    deckName: z.string().trim().max(140).nullable().optional(),
  })
  .refine((value) => Boolean(value.token || value.inviteToken || value.inviteUrl), { message: "token required" });

export const reportResultBodySchema = z.object({
  matchId: z.string().uuid(),
  result: z.enum(["a_win", "b_win", "draw"]),
  playerAGameWins: z.number().int().min(0).max(9).default(0),
  playerBGameWins: z.number().int().min(0).max(9).default(0),
  draws: z.number().int().min(0).max(9).default(0),
});

export const confirmResultBodySchema = z.object({
  matchId: z.string().uuid(),
  action: z.enum(["confirm", "dispute"]),
});

export const overrideResultBodySchema = reportResultBodySchema.extend({
  note: z.string().trim().max(500).optional(),
});

export const dropParticipantBodySchema = z.object({
  participantId: z.string().uuid().optional(),
});

export type AdminClient = SupabaseClient<any, "public", any>;
export type TournamentActor =
  | { kind: "user"; user: User; actorKey: string; guestKeyHash: null }
  | { kind: "guest"; user: null; actorKey: string; guestKeyHash: string };

export type TournamentRow = {
  id: string;
  venue_id: string | null;
  host_user_id: string;
  title: string;
  format: string;
  status: "registration" | "active" | "completed" | "cancelled";
  structure: "swiss_top_cut";
  current_round: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  expires_at: string;
};

export type TournamentParticipantRow = {
  id: string;
  tournament_id: string;
  user_id: string | null;
  guest_key_hash: string | null;
  display_name: string;
  art: Record<string, unknown>;
  deck_id: string | null;
  deck_name: string | null;
  seed: number;
  dropped_at: string | null;
  joined_at: string;
};

export type TournamentRoundRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  phase: "swiss" | "top_cut";
  status: "pairing" | "active" | "completed";
  created_at: string;
  completed_at: string | null;
};

export type TournamentMatchRow = {
  id: string;
  tournament_id: string;
  round_id: string;
  table_number: number;
  player_a_id: string | null;
  player_b_id: string | null;
  player_a_game_wins: number;
  player_b_game_wins: number;
  draws: number;
  result: "a_win" | "b_win" | "draw" | null;
  status: "pending" | "reported" | "confirmed" | "disputed" | "bye";
  winner_participant_id: string | null;
  reported_by_participant_id: string | null;
  confirmed_by_participant_id: string | null;
  disputed_by_participant_id: string | null;
  host_override_by: string | null;
  created_at: string;
  updated_at: string;
};

export function requireTournamentAdmin(): AdminClient | NextResponse {
  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  return admin;
}

export async function requireTournamentUser(req: NextRequest): Promise<
  | { ok: true; user: User }
  | { ok: false; response: NextResponse }
> {
  const { user } = await getUserAndSupabase(req);
  if (!user) return { ok: false, response: NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 }) };
  return { ok: true, user };
}

export async function getTournamentActor(req: NextRequest): Promise<
  | { ok: true; actor: TournamentActor }
  | { ok: false; response: NextResponse }
> {
  const { user } = await getUserAndSupabase(req);
  if (user) return { ok: true, actor: { kind: "user", user, actorKey: user.id, guestKeyHash: null } };
  const guestToken = req.headers.get(TOURNAMENT_GUEST_HEADER)?.trim();
  if (!guestToken || guestToken.length < 12 || guestToken.length > 256) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Sign in or join with a guest session" }, { status: 401 }),
    };
  }
  const guestKeyHash = hashGuestKey(guestToken);
  return { ok: true, actor: { kind: "guest", user: null, actorKey: `guest:${guestKeyHash}`, guestKeyHash } };
}

export function makeTournamentInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTournamentInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashGuestKey(token: string): string {
  return createHash("sha256").update(`tournament-guest:${token}`).digest("hex");
}

export function getInviteTokenFromJoinBody(body: z.infer<typeof joinTournamentBodySchema>): string | null {
  const direct = body.token ?? body.inviteToken;
  if (direct) return direct.trim();
  const inviteUrl = body.inviteUrl?.trim();
  if (!inviteUrl) return null;
  try {
    const parsed = new URL(inviteUrl);
    return parsed.searchParams.get("tournamentToken") ?? parsed.searchParams.get("token");
  } catch {
    return null;
  }
}

export function buildTournamentInviteUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://www.manatap.ai";
  const url = new URL("/app/tournament", base);
  url.searchParams.set("tournamentToken", token);
  return url.toString();
}

export function tournamentExpiresAt(): string {
  return new Date(Date.now() + TOURNAMENT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function assertUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function checkTournamentBurstLimit(
  req: NextRequest,
  action: string,
  actorKey: string,
): { allowed: true; rateLimit: ReturnType<typeof checkRateLimit> } | { allowed: false; response: NextResponse } {
  const maxRequests = action === "snapshot" ? 240 : action === "join" ? 40 : 60;
  const rateLimit = checkRateLimit(
    req,
    {
      windowMs: 60 * 1000,
      maxRequests,
      keyGenerator: () => `tournament:${action}:${actorKey}`,
    },
    actorKey,
  );
  if (!rateLimit.allowed) {
    return {
      allowed: false,
      response: addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Rate limit exceeded", retryAfter: rateLimit.retryAfter }, { status: 429 }),
        rateLimit,
      ),
    };
  }
  return { allowed: true, rateLimit };
}

export function withTournamentRateLimitHeaders(response: NextResponse, rateLimit: ReturnType<typeof checkRateLimit>) {
  return addRateLimitHeaders(response, rateLimit);
}

export async function getTournamentAccess(
  admin: AdminClient,
  tournamentId: string,
  actor: TournamentActor,
): Promise<
  | { ok: true; tournament: TournamentRow; participant: TournamentParticipantRow | null; isHost: boolean }
  | { ok: false; response: NextResponse }
> {
  if (!assertUuid(tournamentId)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Invalid tournament id" }, { status: 400 }) };
  }
  const { data: tournament, error } = await admin.from("tournaments").select("*").eq("id", tournamentId).maybeSingle();
  if (error) {
    console.error("[tournaments] tournament lookup failed", error);
    return { ok: false, response: NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }) };
  }
  if (!tournament) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 }) };
  }
  const typed = tournament as TournamentRow;
  const isHost = actor.kind === "user" && typed.host_user_id === actor.user.id;
  const participant = await findParticipantForActor(admin, typed.id, actor);
  if (!isHost && !participant) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 }) };
  }
  return { ok: true, tournament: typed, participant, isHost };
}

export async function findParticipantForActor(
  admin: AdminClient,
  tournamentId: string,
  actor: TournamentActor,
): Promise<TournamentParticipantRow | null> {
  let q = admin.from("tournament_participants").select("*").eq("tournament_id", tournamentId);
  q = actor.kind === "user" ? q.eq("user_id", actor.user.id) : q.eq("guest_key_hash", actor.guestKeyHash);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("[tournaments] participant lookup failed", error);
    return null;
  }
  return (data as TournamentParticipantRow | null) ?? null;
}

function asMatchForStandings(match: TournamentMatchRow, round: TournamentRoundRow): TournamentMatchForStandings {
  return {
    id: match.id,
    round_id: match.round_id,
    round_number: round.round_number,
    phase: round.phase,
    player_a_id: match.player_a_id,
    player_b_id: match.player_b_id,
    winner_participant_id: match.winner_participant_id,
    result: match.result,
    status: match.status,
    player_a_game_wins: match.player_a_game_wins,
    player_b_game_wins: match.player_b_game_wins,
    draws: match.draws,
  };
}

export async function loadTournamentSnapshot(admin: AdminClient, tournament: TournamentRow, actor: TournamentActor) {
  const [{ data: venue }, { data: participants }, { data: rounds }, { data: matches }, { data: invites }] =
    await Promise.all([
      tournament.venue_id
        ? admin.from("tournament_venues").select("id, name, location").eq("id", tournament.venue_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("tournament_participants").select("*").eq("tournament_id", tournament.id).order("seed", { ascending: true }),
      admin.from("tournament_rounds").select("*").eq("tournament_id", tournament.id).order("round_number", { ascending: true }),
      admin.from("tournament_matches").select("*").eq("tournament_id", tournament.id).order("table_number", { ascending: true }),
      actor.kind === "user" && tournament.host_user_id === actor.user.id
        ? admin
            .from("tournament_invites")
            .select("expires_at, revoked_at")
            .eq("tournament_id", tournament.id)
            .is("revoked_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] }),
    ]);

  const participantRows = (participants ?? []) as TournamentParticipantRow[];
  const roundRows = (rounds ?? []) as TournamentRoundRow[];
  const matchRows = (matches ?? []) as TournamentMatchRow[];
  const roundById = new Map(roundRows.map((r) => [r.id, r]));
  const standingMatches = matchRows
    .map((m) => {
      const round = roundById.get(m.round_id);
      return round ? asMatchForStandings(m, round) : null;
    })
    .filter((m): m is TournamentMatchForStandings => Boolean(m));
  const standings = calculateStandings(
    participantRows.map(toPairingParticipant),
    standingMatches,
  );

  return {
    id: tournament.id,
    title: tournament.title,
    format: tournament.format,
    status: tournament.status,
    structure: tournament.structure,
    currentRound: tournament.current_round,
    settings: tournament.settings,
    venue: venue ?? null,
    isHost: actor.kind === "user" && tournament.host_user_id === actor.user.id,
    me: await findParticipantForActor(admin, tournament.id, actor),
    invite: Array.isArray(invites) && invites[0] ? { expiresAt: invites[0].expires_at } : null,
    participants: participantRows.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      art: p.art,
      deckId: p.deck_id,
      deckName: p.deck_name,
      seed: p.seed,
      dropped: Boolean(p.dropped_at),
      joinedAt: p.joined_at,
    })),
    rounds: roundRows.map((r) => ({
      id: r.id,
      roundNumber: r.round_number,
      phase: r.phase,
      status: r.status,
      completedAt: r.completed_at,
    })),
    matches: matchRows.map((m) => ({
      id: m.id,
      roundId: m.round_id,
      tableNumber: m.table_number,
      playerAId: m.player_a_id,
      playerBId: m.player_b_id,
      playerAGameWins: m.player_a_game_wins,
      playerBGameWins: m.player_b_game_wins,
      draws: m.draws,
      result: m.result,
      status: m.status,
      winnerParticipantId: m.winner_participant_id,
      reportedByParticipantId: m.reported_by_participant_id,
      confirmedByParticipantId: m.confirmed_by_participant_id,
      disputedByParticipantId: m.disputed_by_participant_id,
    })),
    standings,
    updatedAt: tournament.updated_at,
    endedAt: tournament.ended_at,
  };
}

export function toPairingParticipant(row: TournamentParticipantRow): TournamentParticipantForPairing {
  return {
    id: row.id,
    seed: row.seed,
    display_name: row.display_name,
    dropped: Boolean(row.dropped_at),
  };
}

export async function createRoundAndMatches(
  admin: AdminClient,
  tournament: TournamentRow,
  phase: "swiss" | "top_cut",
  roundNumber: number,
): Promise<{ ok: true; round: TournamentRoundRow } | { ok: false; response: NextResponse }> {
  const [{ data: participants }, { data: rounds }, { data: matches }] = await Promise.all([
    admin.from("tournament_participants").select("*").eq("tournament_id", tournament.id).order("seed", { ascending: true }),
    admin.from("tournament_rounds").select("*").eq("tournament_id", tournament.id),
    admin.from("tournament_matches").select("*").eq("tournament_id", tournament.id),
  ]);
  const participantRows = (participants ?? []) as TournamentParticipantRow[];
  const roundRows = (rounds ?? []) as TournamentRoundRow[];
  const matchRows = (matches ?? []) as TournamentMatchRow[];
  const roundById = new Map(roundRows.map((r) => [r.id, r]));
  const previousMatches = matchRows
    .map((m) => {
      const round = roundById.get(m.round_id);
      return round ? asMatchForStandings(m, round) : null;
    })
    .filter((m): m is TournamentMatchForStandings => Boolean(m));
  const topCut = String(tournament.settings?.topCut ?? "none");
  const topCutSize = topCut === "top8" ? 8 : topCut === "top4" ? 4 : 0;
  const pairings =
    phase === "top_cut"
      ? createTopCutPairings(participantRows.map(toPairingParticipant), previousMatches, topCutSize)
      : createSwissPairings({
          participants: participantRows.map(toPairingParticipant),
          previousMatches,
          roundNumber,
          phase,
        });

  if (pairings.length === 0) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Not enough players to pair" }, { status: 400 }) };
  }

  const { data: round, error: roundError } = await admin
    .from("tournament_rounds")
    .insert({ tournament_id: tournament.id, round_number: roundNumber, phase, status: "active" })
    .select("*")
    .single();
  if (roundError || !round) {
    console.error("[tournaments] create round failed", roundError);
    return { ok: false, response: NextResponse.json({ ok: false, error: "Failed to create round" }, { status: 500 }) };
  }

  const typedRound = round as TournamentRoundRow;
  const rows = pairings.map((p) => ({
    tournament_id: tournament.id,
    round_id: typedRound.id,
    table_number: p.tableNumber,
    player_a_id: p.playerAId,
    player_b_id: p.playerBId,
    status: p.status,
    result: p.result,
    winner_participant_id: p.winnerParticipantId,
    player_a_game_wins: p.status === "bye" ? 2 : 0,
    player_b_game_wins: 0,
    draws: 0,
  }));
  const { error: matchError } = await admin.from("tournament_matches").insert(rows);
  if (matchError) {
    console.error("[tournaments] create matches failed", matchError);
    await admin.from("tournament_rounds").delete().eq("id", typedRound.id);
    return { ok: false, response: NextResponse.json({ ok: false, error: "Failed to create pairings" }, { status: 500 }) };
  }

  await admin
    .from("tournaments")
    .update({
      status: "active",
      current_round: roundNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tournament.id);

  return { ok: true, round: typedRound };
}

export async function markRoundCompleteIfResolved(admin: AdminClient, tournamentId: string, roundId: string) {
  const { data } = await admin.from("tournament_matches").select("*").eq("round_id", roundId);
  const matches = (data ?? []) as TournamentMatchRow[];
  if (!allRoundMatchesResolved(matches.map((m) => ({
    id: m.id,
    round_id: m.round_id,
    round_number: 0,
    phase: "swiss",
    player_a_id: m.player_a_id,
    player_b_id: m.player_b_id,
    winner_participant_id: m.winner_participant_id,
    result: m.result,
    status: m.status,
    player_a_game_wins: m.player_a_game_wins,
    player_b_game_wins: m.player_b_game_wins,
    draws: m.draws,
  })))) {
    return;
  }
  await admin
    .from("tournament_rounds")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", roundId)
    .eq("tournament_id", tournamentId);
}

export function winnerFromResult(
  match: Pick<TournamentMatchRow, "player_a_id" | "player_b_id">,
  result: "a_win" | "b_win" | "draw",
): string | null {
  if (result === "draw") return null;
  return result === "a_win" ? match.player_a_id : match.player_b_id;
}
