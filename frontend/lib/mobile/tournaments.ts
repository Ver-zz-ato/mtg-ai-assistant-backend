import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { getServiceRoleClient } from "@/lib/server-supabase";
import {
  normalizeCardName,
  scryfallStatusAllowsInFormat,
  userFormatToScryfallLegalityKey,
} from "@/lib/deck/mtgValidators";
import {
  allRoundMatchesResolved,
  calculateStandings,
  createCommanderPodsRound,
  createDoubleEliminationPairings,
  createRoundRobinPairings,
  createSingleEliminationPairings,
  createSwissPairings,
  createTopCutPairings,
  type PairingRow,
  type PodPairingRow,
  type TournamentMatchForStandings,
  type TournamentMode,
  type TournamentParticipantForPairing,
  type TournamentPhase,
} from "@/lib/mobile/tournament-engine";
import { containsProfanity } from "@/lib/profanity";

export const TOURNAMENT_INVITE_TTL_DAYS = 30;
export const TOURNAMENT_GUEST_HEADER = "X-Guest-Session-Token";
export const TOURNAMENT_MAX_PLAYERS = 128;

export const tournamentFormatSchema = z.enum(["Commander", "Standard", "Pioneer", "Modern", "Pauper", "Custom"]);
export const tournamentModeSchema = z.enum(["swiss", "single_elimination", "double_elimination", "round_robin", "commander_pods"]);
export const topCutSchema = z.enum(["none", "top4", "top8"]);
export const deckSubmissionModeSchema = z.enum(["off", "optional", "required"]);
export const deckVisibilitySchema = z.enum(["host_only", "players"]);
export const pairingModeSchema = z.enum(["auto", "manual"]);

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
  name: z.string().trim().min(2).max(120).refine((value) => !containsProfanity(value), "profanity_not_allowed"),
  location: z.string().trim().max(180).optional().default("").refine((value) => !containsProfanity(value), "profanity_not_allowed"),
});

export const createTournamentBodySchema = z.object({
  venueId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(140).refine((value) => !containsProfanity(value), "profanity_not_allowed"),
  format: tournamentFormatSchema.default("Commander"),
  mode: tournamentModeSchema.default("swiss"),
  playerCap: z.number().int().min(2).max(TOURNAMENT_MAX_PLAYERS).default(32),
  swissRounds: z.number().int().min(1).max(12).default(3),
  topCut: topCutSchema.default("none"),
  podRounds: z.number().int().min(1).max(8).default(3),
  roundRobinDrawsEnabled: z.boolean().default(true),
  pairingMode: pairingModeSchema.default("auto"),
  decklistsEnabled: z.boolean().default(true),
  deckSubmissionMode: deckSubmissionModeSchema.optional(),
  deckVisibility: deckVisibilitySchema.default("host_only"),
  deckLegalityCheckEnabled: z.boolean().default(false),
});

export const updateTournamentSetupBodySchema = createTournamentBodySchema.partial();

export const tournamentDeckCardSchema = z.object({
  name: z.string().trim().min(1).max(180),
  qty: z.number().int().min(1).max(999).default(1),
  zone: z.enum(["mainboard", "sideboard"]).default("mainboard"),
});

export const tournamentDeckSubmissionSchema = z.object({
  deckId: z.string().uuid().nullable().optional(),
  deckName: z.string().trim().max(140).nullable().optional().refine((value) => !containsProfanity(value ?? ""), "profanity_not_allowed"),
  decklistText: z.string().trim().max(100_000).nullable().optional(),
  deckCards: z.array(tournamentDeckCardSchema).max(300).optional().default([]),
});

export const joinTournamentBodySchema = z
  .object({
    token: z.string().min(20).max(256).optional(),
    inviteToken: z.string().min(20).max(256).optional(),
    inviteUrl: z.string().min(1).max(2048).optional(),
    displayName: z.string().trim().min(1).max(80).refine((value) => !containsProfanity(value), "profanity_not_allowed"),
    art: playerArtSchema.default({ source: "none" }),
  })
  .merge(tournamentDeckSubmissionSchema)
  .refine((value) => Boolean(value.token || value.inviteToken || value.inviteUrl), { message: "token required" });

export const updateTournamentDeckBodySchema = tournamentDeckSubmissionSchema.extend({
  participantId: z.string().uuid().optional(),
});

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
  reason: z.enum(["leave", "kick"]).optional(),
});

export const participantIssueBodySchema = z.object({
  message: z.string().trim().max(500).optional().refine((value) => !containsProfanity(value ?? ""), "profanity_not_allowed"),
});

export const podResultBodySchema = z.object({
  winnerParticipantId: z.string().uuid(),
  note: z.string().trim().max(500).optional().refine((value) => !containsProfanity(value ?? ""), "profanity_not_allowed"),
});

export const podConfirmBodySchema = z.object({
  action: z.enum(["confirm", "dispute"]),
});

export const reseatPodsBodySchema = z.object({
  roundId: z.string().uuid(),
  assignments: z.array(z.object({
    participantId: z.string().uuid(),
    podId: z.string().uuid(),
  })).min(3).max(TOURNAMENT_MAX_PLAYERS),
});

export const manualPairingSchema = z.object({
  tableNumber: z.number().int().min(1).max(TOURNAMENT_MAX_PLAYERS),
  playerAId: z.string().uuid(),
  playerBId: z.string().uuid().nullable().optional(),
});

export const manualPodSchema = z.object({
  tableNumber: z.number().int().min(1).max(TOURNAMENT_MAX_PLAYERS),
  participantIds: z.array(z.string().uuid()).min(3).max(4),
});

export const manualRoundBodySchema = z.object({
  manualPairings: z.array(manualPairingSchema).max(TOURNAMENT_MAX_PLAYERS).optional(),
  manualPods: z.array(manualPodSchema).max(TOURNAMENT_MAX_PLAYERS).optional(),
  allowRematches: z.boolean().default(false),
});

export const declareOverallWinnerBodySchema = z.object({
  participantId: z.string().uuid(),
});

export const addTestParticipantsBodySchema = z.object({
  count: z.number().int().min(1).max(24).default(4),
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
  mode: TournamentMode;
  status: "registration" | "active" | "completed" | "cancelled";
  structure: "swiss_top_cut" | string;
  current_round: number;
  settings: Record<string, unknown>;
  overall_winner_participant_id: string | null;
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
  deck_source: "none" | "saved" | "pasted";
  decklist_text: string | null;
  deck_cards: Array<{ name: string; qty: number; zone: "mainboard" | "sideboard" }>;
  deck_submitted_at: string | null;
  deck_updated_at: string | null;
  seed: number;
  dropped_at: string | null;
  joined_at: string;
};

export type TournamentRoundRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  phase: TournamentPhase;
  stage_order: number | null;
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
  bracket_slot: string | null;
  source_label: string | null;
  next_match_hint: string | null;
  loser_next_match_hint: string | null;
  result_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TournamentPodRow = {
  id: string;
  tournament_id: string;
  round_id: string;
  table_number: number;
  status: "pending" | "reported" | "confirmed" | "disputed";
  winner_participant_id: string | null;
  reported_winner_participant_id: string | null;
  reported_by_participant_id: string | null;
  disputed_by_participant_id: string | null;
  reported_at: string | null;
  confirmed_at: string | null;
  result_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TournamentPodEntryRow = {
  id: string;
  pod_id: string;
  tournament_id: string;
  round_id: string;
  participant_id: string;
  seat_number: number;
  points: number;
  placement: number | null;
  dropped: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentPodConfirmationRow = {
  id: string;
  pod_id: string;
  tournament_id: string;
  round_id: string;
  participant_id: string;
  action: "confirm" | "dispute";
  created_at: string;
  updated_at: string;
};

export type TournamentEventRow = {
  id: string;
  tournament_id: string;
  actor_user_id: string | null;
  actor_participant_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const PUBLIC_ACTIVITY_EVENT_TYPES = [
  "tournament_started",
  "round_advanced",
  "manual_pairings_created",
  "manual_pods_created",
  "match_confirmed",
  "match_disputed",
  "match_override",
  "pod_result",
  "pod_result_reported",
  "pod_result_disputed",
  "pod_seating_updated",
  "participant_left",
  "participant_kicked",
  "overall_winner_declared",
  "test_participants_added",
];

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

export function tournamentDeckSubmissionMode(tournament: Pick<TournamentRow, "settings">): "off" | "optional" | "required" {
  const raw = tournament.settings?.deckSubmissionMode;
  if (raw === "off" || raw === "optional" || raw === "required") return raw;
  return tournament.settings?.decklistsEnabled === false ? "off" : "optional";
}

export function tournamentDeckVisibility(tournament: Pick<TournamentRow, "settings">): "host_only" | "players" {
  return tournament.settings?.deckVisibility === "players" ? "players" : "host_only";
}

export function tournamentDeckLegalityCheckEnabled(tournament: Pick<TournamentRow, "settings">): boolean {
  return tournament.settings?.deckLegalityCheckEnabled === true;
}

export function tournamentMode(tournament: Pick<TournamentRow, "mode" | "settings">): TournamentMode {
  const raw = tournament.mode ?? tournament.settings?.tournamentMode;
  if (
    raw === "single_elimination" ||
    raw === "double_elimination" ||
    raw === "round_robin" ||
    raw === "commander_pods" ||
    raw === "swiss"
  ) {
    return raw;
  }
  return "swiss";
}

function phaseLabel(phase: TournamentPhase): string {
  switch (phase) {
    case "top_cut":
      return "Top Cut";
    case "single_elimination":
      return "Single Elimination";
    case "double_elimination_winners":
      return "Double Elim Winners";
    case "double_elimination_losers":
      return "Double Elim Second Chance";
    case "double_elimination_grand_final":
      return "Grand Final";
    case "round_robin":
      return "Round Robin";
    case "commander_pods":
      return "Commander Pods";
    default:
      return "Swiss";
  }
}

export function tournamentPhaseAllowsDraw(phase: TournamentPhase): boolean {
  return phase === "swiss" || phase === "round_robin";
}

function pairWinnerIds(ids: string[]): Array<{ a: string; b: string | null }> {
  const out: Array<{ a: string; b: string | null }> = [];
  for (let i = 0; i < ids.length; i += 2) {
    if (!ids[i]) continue;
    out.push({ a: ids[i], b: ids[i + 1] ?? null });
  }
  return out;
}

function isCommanderFormat(format: string): boolean {
  const f = format.trim().toLowerCase();
  return f === "commander" || f === "edh" || f === "cedh" || f.includes("commander");
}

function isConstructedFormat(format: string): boolean {
  const f = format.trim().toLowerCase();
  return f === "standard" || f === "modern" || f === "pioneer" || f === "pauper";
}

function isBasicLand(name: string, typeLine?: string | null): boolean {
  const n = name.trim().toLowerCase();
  if (["plains", "island", "swamp", "mountain", "forest"].includes(n)) return true;
  if (n.startsWith("snow-covered ")) return true;
  return Boolean(typeLine && /\bbasic land\b/i.test(typeLine));
}

const COMMANDER_SINGLETON_EXCEPTIONS = new Set([
  "relentlessrats",
  "ratcolony",
  "shadowbornapostle",
  "persistentpetitioners",
  "dragonsapproach",
  "nazgul",
]);

export async function validateTournamentDeckLegality(
  admin: AdminClient,
  tournament: Pick<TournamentRow, "format">,
  cards: Array<{ name: string; qty: number; zone: "mainboard" | "sideboard" }>,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const format = String(tournament.format || "").trim();
  const legalityKey = userFormatToScryfallLegalityKey(format);
  if (!legalityKey) return { ok: true };

  const errors: string[] = [];
  const mainboardCount = cards.filter((card) => card.zone !== "sideboard").reduce((sum, card) => sum + card.qty, 0);
  const sideboardCount = cards.filter((card) => card.zone === "sideboard").reduce((sum, card) => sum + card.qty, 0);
  const totalCount = cards.reduce((sum, card) => sum + card.qty, 0);

  if (isCommanderFormat(format) && totalCount !== 100) {
    errors.push(`Commander decks must have exactly 100 cards; this list has ${totalCount}.`);
  }
  if (isConstructedFormat(format)) {
    if (mainboardCount < 60) errors.push(`${format} decks need at least 60 mainboard cards; this list has ${mainboardCount}.`);
    if (sideboardCount > 15) errors.push(`${format} sideboards can have at most 15 cards; this list has ${sideboardCount}.`);
  }

  const uniqueNames = Array.from(new Set(cards.map((card) => card.name.trim()).filter(Boolean)));
  if (uniqueNames.length === 0) {
    errors.push("Decklist has no readable card names.");
  }

  const { data, error } = uniqueNames.length
    ? await admin
        .from("scryfall_cache")
        .select("name, type_line, legalities")
        .in("name", uniqueNames)
    : { data: [], error: null };
  if (error) {
    console.error("[tournaments] legality cache lookup failed", error);
    return { ok: false, response: NextResponse.json({ ok: false, error: "Could not check deck legality" }, { status: 500 }) };
  }

  const byNormalized = new Map<string, { name: string; type_line?: string | null; legalities?: Record<string, string> | null }>();
  for (const row of data ?? []) {
    byNormalized.set(normalizeCardName(String((row as any).name ?? "")), row as any);
  }

  const qtyByName = new Map<string, { name: string; qty: number }>();
  for (const card of cards) {
    const key = normalizeCardName(card.name);
    const current = qtyByName.get(key) ?? { name: card.name, qty: 0 };
    current.qty += card.qty;
    qtyByName.set(key, current);
  }

  const missing: string[] = [];
  const illegal: string[] = [];
  const copyIssues: string[] = [];
  for (const { name, qty } of qtyByName.values()) {
    const row = byNormalized.get(normalizeCardName(name));
    if (!row) {
      missing.push(name);
      continue;
    }
    const status = row.legalities?.[legalityKey];
    if (!scryfallStatusAllowsInFormat(status, legalityKey)) illegal.push(`${name} (${status || "unknown"})`);
    if (isCommanderFormat(format) && qty > 1 && !isBasicLand(name, row.type_line) && !COMMANDER_SINGLETON_EXCEPTIONS.has(normalizeCardName(name))) {
      copyIssues.push(`${name} x${qty}`);
    }
    if (isConstructedFormat(format) && qty > 4 && !isBasicLand(name, row.type_line)) {
      copyIssues.push(`${name} x${qty}`);
    }
  }

  if (missing.length) errors.push(`Could not verify: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "..." : ""}.`);
  if (illegal.length) errors.push(`Not legal in ${format}: ${illegal.slice(0, 8).join(", ")}${illegal.length > 8 ? "..." : ""}.`);
  if (copyIssues.length) errors.push(`Copy limit issues: ${copyIssues.slice(0, 8).join(", ")}${copyIssues.length > 8 ? "..." : ""}.`);

  if (errors.length) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 }),
    };
  }
  return { ok: true };
}

export function canViewParticipantDeck(
  tournament: TournamentRow,
  actor: TournamentActor,
  participant: Pick<TournamentParticipantRow, "user_id" | "guest_key_hash">,
): boolean {
  if (actor.kind === "user" && tournament.host_user_id === actor.user.id) return true;
  if (actor.kind === "user" && participant.user_id === actor.user.id) return true;
  if (actor.kind === "guest" && participant.guest_key_hash === actor.guestKeyHash) return true;
  return tournamentDeckVisibility(tournament) === "players";
}

export async function resolveTournamentDeckSubmission(
  admin: AdminClient,
  tournament: TournamentRow,
  actor: TournamentActor,
  input: z.infer<typeof tournamentDeckSubmissionSchema>,
): Promise<
  | {
      ok: true;
      deck: {
        deck_id: string | null;
        deck_name: string | null;
        deck_source: "none" | "saved" | "pasted";
        decklist_text: string | null;
        deck_cards: Array<{ name: string; qty: number; zone: "mainboard" | "sideboard" }>;
        deck_submitted_at: string | null;
        deck_updated_at: string | null;
      };
    }
  | { ok: false; response: NextResponse }
> {
  const mode = tournamentDeckSubmissionMode(tournament);
  if (mode === "off") {
    return {
      ok: true,
      deck: {
        deck_id: null,
        deck_name: null,
        deck_source: "none",
        decklist_text: null,
        deck_cards: [],
        deck_submitted_at: null,
        deck_updated_at: null,
      },
    };
  }

  const deckId = input.deckId ?? null;
  const decklistText = input.decklistText?.trim() || null;
  const bodyCards = (input.deckCards ?? []).map((card) => ({
    name: card.name.trim(),
    qty: card.qty,
    zone: (card.zone === "sideboard" ? "sideboard" : "mainboard") as "mainboard" | "sideboard",
  }));

  if (!deckId && !decklistText && mode === "required") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Decklist required for this tournament" }, { status: 400 }) };
  }

  const now = new Date().toISOString();
  if (deckId) {
    if (actor.kind !== "user") {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Sign in to use a saved deck" }, { status: 401 }) };
    }
    const { data: deck, error: deckError } = await admin
      .from("decks")
      .select("id, title, user_id")
      .eq("id", deckId)
      .eq("user_id", actor.user.id)
      .maybeSingle();
    if (deckError) {
      console.error("[tournaments] saved deck lookup failed", deckError);
      return { ok: false, response: NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }) };
    }
    if (!deck) return { ok: false, response: NextResponse.json({ ok: false, error: "Saved deck not found" }, { status: 404 }) };
    const { data: rows } = await admin
      .from("deck_cards")
      .select("name, qty, zone")
      .eq("deck_id", deckId)
      .order("zone", { ascending: true })
      .order("name", { ascending: true });
    const cards: Array<{ name: string; qty: number; zone: "mainboard" | "sideboard" }> = (rows ?? []).map((row: any) => ({
      name: String(row.name ?? "").trim(),
      qty: Math.max(1, Number(row.qty ?? 1) || 1),
      zone: (row.zone === "sideboard" ? "sideboard" : "mainboard") as "mainboard" | "sideboard",
    })).filter((card) => card.name);
    if (tournamentDeckLegalityCheckEnabled(tournament)) {
      const legality = await validateTournamentDeckLegality(admin, tournament, cards);
      if (!legality.ok) return legality;
    }
    return {
      ok: true,
      deck: {
        deck_id: deckId,
        deck_name: input.deckName?.trim() || String(deck.title ?? "Saved deck"),
        deck_source: "saved",
        decklist_text: null,
        deck_cards: cards,
        deck_submitted_at: now,
        deck_updated_at: now,
      },
    };
  }

  if (decklistText) {
    if (tournamentDeckLegalityCheckEnabled(tournament)) {
      const legality = await validateTournamentDeckLegality(admin, tournament, bodyCards);
      if (!legality.ok) return legality;
    }
    return {
      ok: true,
      deck: {
        deck_id: null,
        deck_name: input.deckName?.trim() || "Pasted decklist",
        deck_source: "pasted",
        decklist_text: decklistText,
        deck_cards: bodyCards,
        deck_submitted_at: now,
        deck_updated_at: now,
      },
    };
  }

  return {
    ok: true,
    deck: {
      deck_id: null,
      deck_name: input.deckName?.trim() || null,
      deck_source: "none",
      decklist_text: null,
      deck_cards: [],
      deck_submitted_at: null,
      deck_updated_at: null,
    },
  };
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

export async function logTournamentEvent(
  admin: AdminClient,
  input: {
    tournamentId: string;
    eventType: string;
    actor?: TournamentActor;
    actorParticipantId?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("tournament_events").insert({
    tournament_id: input.tournamentId,
    actor_user_id: input.actor?.kind === "user" ? input.actor.user.id : null,
    actor_participant_id: input.actorParticipantId ?? null,
    event_type: input.eventType,
    payload: input.payload ?? {},
  });
  if (error) console.error("[tournaments] event insert failed", error);
}

function payloadText(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function activityMessageForEvent(event: TournamentEventRow, participantNameById: Map<string, string>): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const table = typeof payload.tableNumber === "number" ? `Table ${payload.tableNumber}` : "A match";
  const pod = typeof payload.tableNumber === "number" ? `Pod ${payload.tableNumber}` : "A pod";
  const participantId = payloadText(payload, "participantId");
  const winnerId = payloadText(payload, "winnerParticipantId");
  const displayName = payloadText(payload, "displayName") ?? (participantId ? participantNameById.get(participantId) ?? null : null);
  const winnerName = payloadText(payload, "winnerDisplayName") ?? (winnerId ? participantNameById.get(winnerId) ?? null : null);
  const playerA = payloadText(payload, "playerADisplayName");
  const playerB = payloadText(payload, "playerBDisplayName");
  const matchup = playerA && playerB ? `${playerA} vs ${playerB}` : table;

  switch (event.event_type) {
    case "tournament_started":
      return "Tournament started. Round 1 is ready.";
    case "round_advanced":
      return "Tournament advanced. New pairings are ready.";
    case "manual_pairings_created":
      return "Host manually set the match pairings.";
    case "manual_pods_created":
      return "Host manually set Commander pods.";
    case "match_confirmed":
      return winnerName ? `${table} confirmed: ${winnerName} won (${matchup}).` : `${table} confirmed as a draw (${matchup}).`;
    case "match_disputed":
      return `${table} was disputed (${matchup}). Host review needed.`;
    case "match_override":
      return "Host updated a match result.";
    case "pod_result_reported":
      return `${pod} reported winner: ${winnerName ?? "a player"}. Waiting for podmate confirmations.`;
    case "pod_result_disputed":
      return `${pod} result was disputed. Host review needed.`;
    case "pod_result":
      return `${pod} confirmed${winnerName ? `: ${winnerName} won.` : "."}`;
    case "pod_seating_updated":
      return "Host updated Commander pod seating.";
    case "participant_left":
      return `${displayName ?? "A player"} left the tournament.`;
    case "participant_kicked":
      return `${displayName ?? "A player"} was removed by the host.`;
    case "overall_winner_declared":
      return `${displayName ?? "A player"} was announced as the tournament winner.`;
    case "test_participants_added":
      return `${Number(payload.count ?? 0) || "Test"} test players were added.`;
    default:
      return null;
  }
}

export async function forfeitCurrentMatchForParticipant(
  admin: AdminClient,
  tournamentId: string,
  participantId: string,
): Promise<{ matchId: string; roundId: string; winnerParticipantId: string | null } | null> {
  const { data: rounds } = await admin
    .from("tournament_rounds")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("status", "active")
    .order("round_number", { ascending: false })
    .limit(1);
  const round = Array.isArray(rounds) ? (rounds[0] as TournamentRoundRow | undefined) : undefined;
  if (!round) return null;
  const { data: match } = await admin
    .from("tournament_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("round_id", round.id)
    .in("status", ["pending", "reported", "disputed"])
    .or(`player_a_id.eq.${participantId},player_b_id.eq.${participantId}`)
    .maybeSingle();
  if (!match) return null;
  const typed = match as TournamentMatchRow;
  const leavingIsA = typed.player_a_id === participantId;
  const opponentId = leavingIsA ? typed.player_b_id : typed.player_a_id;
  if (!opponentId) return null;
  const { error } = await admin
    .from("tournament_matches")
    .update({
      player_a_game_wins: leavingIsA ? 0 : 2,
      player_b_game_wins: leavingIsA ? 2 : 0,
      draws: 0,
      result: leavingIsA ? "b_win" : "a_win",
      winner_participant_id: opponentId,
      status: "confirmed",
      reported_by_participant_id: null,
      confirmed_by_participant_id: null,
      disputed_by_participant_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", typed.id);
  if (error) {
    console.error("[tournaments] forfeit match update failed", error);
    return null;
  }
  await markRoundCompleteIfResolved(admin, tournamentId, round.id);
  return { matchId: typed.id, roundId: round.id, winnerParticipantId: opponentId };
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

function calculatePodStandings(participants: TournamentParticipantRow[], pods: TournamentPodRow[], entries: TournamentPodEntryRow[]) {
  const confirmedPodIds = new Set(pods.filter((pod) => pod.status === "confirmed").map((pod) => pod.id));
  const stats = new Map<string, { participantId: string; seed: number; matchPoints: number; wins: number; losses: number; draws: number }>();
  for (const participant of participants) {
    stats.set(participant.id, {
      participantId: participant.id,
      seed: participant.seed,
      matchPoints: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });
  }
  for (const entry of entries) {
    if (!confirmedPodIds.has(entry.pod_id)) continue;
    const current = stats.get(entry.participant_id);
    if (!current || entry.dropped) continue;
    current.matchPoints += Number(entry.points ?? 0);
    if (Number(entry.points ?? 0) > 0 || entry.placement === 1) current.wins += 1;
    else current.losses += 1;
  }
  return [...stats.values()]
    .sort((a, b) => b.matchPoints - a.matchPoints || b.wins - a.wins || a.seed - b.seed)
    .map((standing, index) => ({
      participantId: standing.participantId,
      rank: index + 1,
      seed: standing.seed,
      matchPoints: standing.matchPoints,
      matchesPlayed: standing.wins + standing.losses + standing.draws,
      wins: standing.wins,
      losses: standing.losses,
      draws: standing.draws,
      byes: 0,
      gameWins: standing.wins,
      gameLosses: standing.losses,
      gameDraws: 0,
      opponentMatchWinPct: 0.333333,
      gameWinPct: standing.wins + standing.losses > 0 ? standing.wins / (standing.wins + standing.losses) : 0.333333,
      opponentGameWinPct: 0.333333,
    }));
}

export async function loadTournamentSnapshot(admin: AdminClient, tournament: TournamentRow, actor: TournamentActor) {
  const isHost = actor.kind === "user" && tournament.host_user_id === actor.user.id;
  const [
    { data: venue },
    { data: participants },
    { data: rounds },
    { data: matches },
    { data: pods },
    { data: podEntries },
    { data: podConfirmations },
    { data: invites },
    { data: hostEvents },
    { data: activityEvents },
  ] =
    await Promise.all([
      tournament.venue_id
        ? admin.from("tournament_venues").select("id, name, location").eq("id", tournament.venue_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("tournament_participants").select("*").eq("tournament_id", tournament.id).order("seed", { ascending: true }),
      admin.from("tournament_rounds").select("*").eq("tournament_id", tournament.id).order("stage_order", { ascending: true }).order("round_number", { ascending: true }),
      admin.from("tournament_matches").select("*").eq("tournament_id", tournament.id).order("table_number", { ascending: true }),
      admin.from("tournament_pods").select("*").eq("tournament_id", tournament.id).order("table_number", { ascending: true }),
      admin.from("tournament_pod_entries").select("*").eq("tournament_id", tournament.id).order("seat_number", { ascending: true }),
      admin.from("tournament_pod_confirmations").select("*").eq("tournament_id", tournament.id).order("created_at", { ascending: true }),
      isHost
        ? admin
            .from("tournament_invites")
            .select("expires_at, revoked_at")
            .eq("tournament_id", tournament.id)
            .is("revoked_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] }),
      isHost
        ? admin
            .from("tournament_events")
            .select("*")
            .eq("tournament_id", tournament.id)
            .in("event_type", [...PUBLIC_ACTIVITY_EVENT_TYPES, "participant_issue"])
            .order("created_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] }),
      admin
        .from("tournament_events")
        .select("*")
        .eq("tournament_id", tournament.id)
        .in("event_type", PUBLIC_ACTIVITY_EVENT_TYPES)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  const participantRows = (participants ?? []) as TournamentParticipantRow[];
  const roundRows = (rounds ?? []) as TournamentRoundRow[];
  const matchRows = (matches ?? []) as TournamentMatchRow[];
  const podRows = (pods ?? []) as TournamentPodRow[];
  const podEntryRows = (podEntries ?? []) as TournamentPodEntryRow[];
  const podConfirmationRows = (podConfirmations ?? []) as TournamentPodConfirmationRow[];
  const activityEventRows = (activityEvents ?? []) as TournamentEventRow[];
  const participantNameById = new Map(participantRows.map((participant) => [participant.id, participant.display_name]));
  const roundById = new Map(roundRows.map((r) => [r.id, r]));
  const standingMatches = matchRows
    .map((m) => {
      const round = roundById.get(m.round_id);
      return round ? asMatchForStandings(m, round) : null;
    })
    .filter((m): m is TournamentMatchForStandings => Boolean(m));
  const standings =
    tournamentMode(tournament) === "commander_pods"
      ? calculatePodStandings(participantRows, podRows, podEntryRows)
      : calculateStandings(
          participantRows.map(toPairingParticipant),
          standingMatches,
        );

  return {
    id: tournament.id,
    title: tournament.title,
    format: tournament.format,
    mode: tournamentMode(tournament),
    status: tournament.status,
    structure: tournament.structure,
    currentRound: tournament.current_round,
    settings: tournament.settings,
    overallWinnerParticipantId: tournament.overall_winner_participant_id ?? null,
    venue: venue ?? null,
    isHost,
    me: await findParticipantForActor(admin, tournament.id, actor),
    invite: Array.isArray(invites) && invites[0] ? { expiresAt: invites[0].expires_at } : null,
    participants: participantRows.map((p) => {
      const deckVisible = canViewParticipantDeck(tournament, actor, p);
      return {
      id: p.id,
      displayName: p.display_name,
      art: p.art,
      deckId: p.deck_id,
      deckName: p.deck_name,
      deckSource: p.deck_source ?? (p.deck_id ? "saved" : p.deck_name ? "pasted" : "none"),
      deckSubmitted: Boolean(p.deck_id || p.decklist_text || (Array.isArray(p.deck_cards) && p.deck_cards.length > 0)),
      deckVisible,
      deck: deckVisible
        ? {
            source: p.deck_source ?? (p.deck_id ? "saved" : p.deck_name ? "pasted" : "none"),
            deckId: p.deck_id,
            name: p.deck_name,
            decklistText: p.decklist_text,
            cards: Array.isArray(p.deck_cards) ? p.deck_cards : [],
            submittedAt: p.deck_submitted_at,
            updatedAt: p.deck_updated_at,
          }
        : null,
      seed: p.seed,
      dropped: Boolean(p.dropped_at),
      joinedAt: p.joined_at,
    };
    }),
    rounds: roundRows.map((r) => ({
      id: r.id,
      roundNumber: r.round_number,
      phase: r.phase,
      status: r.status,
      stageOrder: r.stage_order ?? r.round_number,
      label: phaseLabel(r.phase),
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
      bracketSlot: m.bracket_slot,
      sourceLabel: m.source_label,
      nextMatchHint: m.next_match_hint,
      loserNextMatchHint: m.loser_next_match_hint,
      resultPayload: m.result_payload ?? {},
    })),
    pods: podRows.map((p) => ({
      id: p.id,
      roundId: p.round_id,
      tableNumber: p.table_number,
      status: p.status,
      winnerParticipantId: p.winner_participant_id,
      reportedWinnerParticipantId: p.reported_winner_participant_id,
      reportedByParticipantId: p.reported_by_participant_id,
      disputedByParticipantId: p.disputed_by_participant_id,
      reportedAt: p.reported_at,
      confirmedAt: p.confirmed_at,
      resultPayload: p.result_payload ?? {},
    })),
    podEntries: podEntryRows.map((entry) => ({
      id: entry.id,
      podId: entry.pod_id,
      roundId: entry.round_id,
      participantId: entry.participant_id,
      seatNumber: entry.seat_number,
      points: entry.points,
      placement: entry.placement,
      dropped: entry.dropped,
    })),
    podConfirmations: podConfirmationRows.map((confirmation) => ({
      id: confirmation.id,
      podId: confirmation.pod_id,
      roundId: confirmation.round_id,
      participantId: confirmation.participant_id,
      action: confirmation.action,
      createdAt: confirmation.created_at,
      updatedAt: confirmation.updated_at,
    })),
    hostEvents: isHost
      ? ((hostEvents ?? []) as TournamentEventRow[]).map((event) => ({
          id: event.id,
          type: event.event_type,
          actorParticipantId: event.actor_participant_id,
          payload: event.payload ?? {},
          createdAt: event.created_at,
        }))
      : [],
    activityEvents: activityEventRows
      .map((event) => {
        const message = activityMessageForEvent(event, participantNameById);
        if (!message) return null;
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        return {
          id: event.id,
          type: event.event_type,
          message,
          createdAt: event.created_at,
          roundId: payloadText(payload, "roundId"),
          matchId: payloadText(payload, "matchId"),
          podId: payloadText(payload, "podId"),
          participantId: payloadText(payload, "participantId") ?? payloadText(payload, "winnerParticipantId"),
        };
      })
      .filter(Boolean),
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
  phase: TournamentPhase,
  roundNumber: number,
  forcedPairings?: PairingRow[],
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
    forcedPairings ??
    (phase === "top_cut"
      ? createTopCutPairings(participantRows.map(toPairingParticipant), previousMatches, topCutSize)
      : phase === "single_elimination"
        ? createSingleEliminationPairings(participantRows.map(toPairingParticipant), roundNumber, previousMatches.filter((m) => m.phase === "single_elimination").map((m) => m.winner_participant_id).filter(Boolean) as string[])
        : phase === "round_robin"
          ? createRoundRobinPairings(participantRows.map(toPairingParticipant), roundNumber)
          : createSwissPairings({
              participants: participantRows.map(toPairingParticipant),
              previousMatches,
              roundNumber,
              phase,
            }));

  if (pairings.length === 0) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Not enough players to pair" }, { status: 400 }) };
  }

  const { data: round, error: roundError } = await admin
    .from("tournament_rounds")
    .insert({ tournament_id: tournament.id, round_number: roundNumber, phase, status: "active", stage_order: nextStageOrder(roundRows) })
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
    bracket_slot: p.bracketSlot ?? null,
    source_label: p.sourceLabel ?? null,
    next_match_hint: p.nextMatchHint ?? null,
    loser_next_match_hint: p.loserNextMatchHint ?? null,
    result_payload: p.resultPayload ?? {},
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

function nextStageOrder(roundRows: TournamentRoundRow[]): number {
  return Math.max(0, ...roundRows.map((round) => Number(round.stage_order ?? round.round_number ?? 0))) + 1;
}

async function loadPairingContext(admin: AdminClient, tournamentId: string) {
  const [{ data: participants }, { data: rounds }, { data: matches }, { data: pods }, { data: podEntries }] = await Promise.all([
    admin.from("tournament_participants").select("*").eq("tournament_id", tournamentId).order("seed", { ascending: true }),
    admin.from("tournament_rounds").select("*").eq("tournament_id", tournamentId),
    admin.from("tournament_matches").select("*").eq("tournament_id", tournamentId),
    admin.from("tournament_pods").select("*").eq("tournament_id", tournamentId),
    admin.from("tournament_pod_entries").select("*").eq("tournament_id", tournamentId),
  ]);
  const participantRows = (participants ?? []) as TournamentParticipantRow[];
  const roundRows = (rounds ?? []) as TournamentRoundRow[];
  const matchRows = (matches ?? []) as TournamentMatchRow[];
  const podRows = (pods ?? []) as TournamentPodRow[];
  const podEntryRows = (podEntries ?? []) as TournamentPodEntryRow[];
  const roundById = new Map(roundRows.map((r) => [r.id, r]));
  const previousMatches = matchRows
    .map((m) => {
      const round = roundById.get(m.round_id);
      return round ? asMatchForStandings(m, round) : null;
    })
    .filter((m): m is TournamentMatchForStandings => Boolean(m));
  return { participantRows, roundRows, matchRows, podRows, podEntryRows, previousMatches };
}

type ManualRoundInput = z.infer<typeof manualRoundBodySchema>;

function activeParticipantIds(participants: TournamentParticipantRow[]): string[] {
  return participants.filter((p) => !p.dropped_at).sort((a, b) => a.seed - b.seed).map((p) => p.id);
}

function manualNextEliminationSlot(prefix: "SE", roundNumber: number, matchIndex: number, currentRoundMatchCount: number): string | null {
  if (currentRoundMatchCount <= 1) return null;
  return `${prefix}-R${roundNumber + 1}-M${Math.ceil(matchIndex / 2)}`;
}

function confirmedPlayersHaveMet(a: string, b: string, matches: TournamentMatchForStandings[]): boolean {
  return matches.some((match) => {
    if (match.status !== "confirmed" && match.status !== "bye") return false;
    return (
      (match.player_a_id === a && match.player_b_id === b) ||
      (match.player_a_id === b && match.player_b_id === a)
    );
  });
}

function validateManualPairings(input: {
  phase: TournamentPhase;
  roundNumber: number;
  mode: TournamentMode;
  participantRows: TournamentParticipantRow[];
  previousMatches: TournamentMatchForStandings[];
  body?: ManualRoundInput;
}): { ok: true; pairings?: PairingRow[]; manual: boolean } | { ok: false; response: NextResponse } {
  if (input.body?.manualPods?.length) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "This format uses 1v1 match pairings, not pods" }, { status: 400 }) };
  }
  const rows = input.body?.manualPairings;
  if (!rows?.length) return { ok: true, manual: false };

  if (input.mode === "round_robin") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Round Robin pairings are automatic" }, { status: 400 }) };
  }
  if (input.phase === "top_cut") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Top Cut bracket pairings are automatic" }, { status: 400 }) };
  }
  if ((input.mode === "single_elimination" || input.mode === "double_elimination") && input.roundNumber > 1) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Bracket rounds advance winners automatically" }, { status: 400 }) };
  }
  if (input.mode === "commander_pods") {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Commander Pods use pod assignments, not 1v1 pairings" }, { status: 400 }) };
  }

  const activeIds = activeParticipantIds(input.participantRows);
  const active = new Set(activeIds);
  const used = new Set<string>();
  const tables = new Set<number>();
  let byes = 0;
  const sortedRows = [...rows].sort((a, b) => a.tableNumber - b.tableNumber);

  for (const row of sortedRows) {
    if (tables.has(row.tableNumber)) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Each table number can only be used once" }, { status: 400 }) };
    }
    tables.add(row.tableNumber);
    if (!active.has(row.playerAId) || (row.playerBId && !active.has(row.playerBId))) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Manual pairings can only use active players" }, { status: 400 }) };
    }
    if (row.playerAId === row.playerBId) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "A player cannot play themselves" }, { status: 400 }) };
    }
    for (const playerId of [row.playerAId, row.playerBId].filter(Boolean) as string[]) {
      if (used.has(playerId)) {
        return { ok: false, response: NextResponse.json({ ok: false, error: "Each player can only appear once" }, { status: 400 }) };
      }
      used.add(playerId);
    }
    if (!row.playerBId) byes += 1;
    if (
      input.phase === "swiss" &&
      row.playerBId &&
      !input.body?.allowRematches &&
      confirmedPlayersHaveMet(row.playerAId, row.playerBId, input.previousMatches)
    ) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: "Manual pairing includes a rematch. Confirm rematches to continue." }, { status: 409 }),
      };
    }
  }

  const missing = activeIds.filter((id) => !used.has(id));
  if (missing.length) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Every active player must be assigned once" }, { status: 400 }) };
  }
  if (byes > 1 || (byes === 1 && activeIds.length % 2 === 0)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Only one bye is allowed, and only with an odd player count" }, { status: 400 }) };
  }

  const pairings = sortedRows.map((row, index) => {
    const tableNumber = index + 1;
    const bracketSlot =
      input.phase === "single_elimination"
        ? `SE-R${input.roundNumber}-M${tableNumber}`
        : input.phase === "double_elimination_winners"
          ? `DE-W${input.roundNumber}-M${tableNumber}`
          : null;
    return {
      tableNumber,
      playerAId: row.playerAId,
      playerBId: row.playerBId ?? null,
      status: row.playerBId ? "pending" as const : "bye" as const,
      result: row.playerBId ? null : "a_win" as const,
      winnerParticipantId: row.playerBId ? null : row.playerAId,
      bracketSlot,
      nextMatchHint: input.phase === "single_elimination" ? manualNextEliminationSlot("SE", input.roundNumber, tableNumber, sortedRows.length) : null,
      resultPayload: { pairingMode: "manual" },
    };
  });

  return { ok: true, pairings, manual: true };
}

function validateManualPods(input: {
  participantRows: TournamentParticipantRow[];
  body?: ManualRoundInput;
}): { ok: true; pods?: PodPairingRow[]; manual: boolean } | { ok: false; response: NextResponse } {
  if (input.body?.manualPairings?.length) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Commander Pods use pod assignments, not 1v1 pairings" }, { status: 400 }) };
  }
  const rows = input.body?.manualPods;
  if (!rows?.length) return { ok: true, manual: false };
  const activeIds = activeParticipantIds(input.participantRows);
  const active = new Set(activeIds);
  const used = new Set<string>();
  const tables = new Set<number>();
  const sortedRows = [...rows].sort((a, b) => a.tableNumber - b.tableNumber);

  for (const row of sortedRows) {
    if (tables.has(row.tableNumber)) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Each pod number can only be used once" }, { status: 400 }) };
    }
    tables.add(row.tableNumber);
    if (row.participantIds.length < 3 || row.participantIds.length > 4) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Commander pods must have three or four players" }, { status: 400 }) };
    }
    for (const participantId of row.participantIds) {
      if (!active.has(participantId)) {
        return { ok: false, response: NextResponse.json({ ok: false, error: "Manual pods can only use active players" }, { status: 400 }) };
      }
      if (used.has(participantId)) {
        return { ok: false, response: NextResponse.json({ ok: false, error: "Each player can only appear in one pod" }, { status: 400 }) };
      }
      used.add(participantId);
    }
  }

  const missing = activeIds.filter((id) => !used.has(id));
  if (missing.length) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Every active player must be assigned to a pod" }, { status: 400 }) };
  }

  return {
    ok: true,
    manual: true,
    pods: sortedRows.map((row, index) => ({
      tableNumber: index + 1,
      participantIds: row.participantIds,
      status: "pending",
      winnerParticipantId: null,
    })),
  };
}

export async function createCommanderPodRound(
  admin: AdminClient,
  tournament: TournamentRow,
  roundNumber: number,
  forcedPods?: PodPairingRow[],
): Promise<{ ok: true; round: TournamentRoundRow } | { ok: false; response: NextResponse }> {
  const { participantRows, roundRows, previousMatches, podRows, podEntryRows } = await loadPairingContext(admin, tournament.id);
  const standingsOrder = calculatePodStandings(participantRows, podRows, podEntryRows).map((standing) => standing.participantId);
  const pods = forcedPods ?? createCommanderPodsRound({
    participants: participantRows.map(toPairingParticipant),
    previousMatches,
    roundNumber,
    standingsOrder,
  });
  if (pods.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Commander pods need 3+ active players and cannot make a 2-player pod" }, { status: 400 }),
    };
  }
  const { data: round, error: roundError } = await admin
    .from("tournament_rounds")
    .insert({
      tournament_id: tournament.id,
      round_number: roundNumber,
      phase: "commander_pods",
      status: "active",
      stage_order: nextStageOrder(roundRows),
    })
    .select("*")
    .single();
  if (roundError || !round) {
    console.error("[tournaments] create pod round failed", roundError);
    return { ok: false, response: NextResponse.json({ ok: false, error: "Failed to create pod round" }, { status: 500 }) };
  }
  const typedRound = round as TournamentRoundRow;
  for (const pod of pods) {
    const { data: podRow, error: podError } = await admin
      .from("tournament_pods")
      .insert({
        tournament_id: tournament.id,
        round_id: typedRound.id,
        table_number: pod.tableNumber,
        status: pod.status,
        winner_participant_id: pod.winnerParticipantId,
        result_payload: {},
      })
      .select("*")
      .single();
    if (podError || !podRow) {
      console.error("[tournaments] create pod failed", podError);
      await admin.from("tournament_rounds").delete().eq("id", typedRound.id);
      return { ok: false, response: NextResponse.json({ ok: false, error: "Failed to create pods" }, { status: 500 }) };
    }
    const entryRows = pod.participantIds.map((participantId, index) => ({
      pod_id: podRow.id,
      tournament_id: tournament.id,
      round_id: typedRound.id,
      participant_id: participantId,
      seat_number: index + 1,
      points: 0,
      placement: null,
      dropped: false,
    }));
    const { error: entryError } = await admin.from("tournament_pod_entries").insert(entryRows);
    if (entryError) {
      console.error("[tournaments] create pod entries failed", entryError);
      await admin.from("tournament_rounds").delete().eq("id", typedRound.id);
      return { ok: false, response: NextResponse.json({ ok: false, error: "Failed to create pod seats" }, { status: 500 }) };
    }
  }
  await admin
    .from("tournaments")
    .update({ status: "active", current_round: roundNumber, updated_at: new Date().toISOString() })
    .eq("id", tournament.id);
  return { ok: true, round: typedRound };
}

export async function createInitialRoundForMode(
  admin: AdminClient,
  tournament: TournamentRow,
  body?: ManualRoundInput,
): Promise<{ ok: true; round: TournamentRoundRow } | { ok: false; response: NextResponse }> {
  const mode = tournamentMode(tournament);
  if (mode === "single_elimination") {
    const { participantRows, previousMatches } = await loadPairingContext(admin, tournament.id);
    const manual = validateManualPairings({
      phase: "single_elimination",
      roundNumber: 1,
      mode,
      participantRows,
      previousMatches,
      body,
    });
    if (!manual.ok) return manual;
    return createRoundAndMatches(admin, tournament, "single_elimination", 1, manual.pairings);
  }
  if (mode === "double_elimination") {
    const { participantRows, previousMatches } = await loadPairingContext(admin, tournament.id);
    const manual = validateManualPairings({
      phase: "double_elimination_winners",
      roundNumber: 1,
      mode,
      participantRows,
      previousMatches,
      body,
    });
    if (!manual.ok) return manual;
    if (manual.pairings) return createRoundAndMatches(admin, tournament, "double_elimination_winners", 1, manual.pairings);
    const next = createDoubleEliminationPairings({
      participants: participantRows.map(toPairingParticipant),
      previousMatches,
      roundNumber: 1,
    });
    return createRoundAndMatches(admin, tournament, next.phase, 1, next.pairings);
  }
  if (mode === "round_robin") {
    if (body?.manualPairings?.length || body?.manualPods?.length) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Round Robin pairings are automatic" }, { status: 400 }) };
    }
    return createRoundAndMatches(admin, tournament, "round_robin", 1);
  }
  if (mode === "commander_pods") {
    const { participantRows } = await loadPairingContext(admin, tournament.id);
    const manual = validateManualPods({ participantRows, body });
    if (!manual.ok) return manual;
    return createCommanderPodRound(admin, tournament, 1, manual.pods);
  }
  const { participantRows, previousMatches } = await loadPairingContext(admin, tournament.id);
  const manual = validateManualPairings({
    phase: "swiss",
    roundNumber: 1,
    mode,
    participantRows,
    previousMatches,
    body,
  });
  if (!manual.ok) return manual;
  return createRoundAndMatches(admin, tournament, "swiss", 1, manual.pairings);
}

async function completeTournament(admin: AdminClient, tournamentId: string) {
  await admin
    .from("tournaments")
    .update({ status: "completed", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", tournamentId);
}

export async function createNextRoundForMode(
  admin: AdminClient,
  tournament: TournamentRow,
  body?: ManualRoundInput,
): Promise<{ ok: true; completed?: boolean; round?: TournamentRoundRow } | { ok: false; response: NextResponse }> {
  const mode = tournamentMode(tournament);
  const { participantRows, roundRows, matchRows, previousMatches } = await loadPairingContext(admin, tournament.id);
  const current = Number(tournament.current_round ?? 0);

  if (mode === "single_elimination") {
    if (body?.manualPairings?.length || body?.manualPods?.length) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Bracket rounds advance winners automatically" }, { status: 400 }) };
    }
    const latestRound = roundRows
      .filter((round) => round.phase === "single_elimination")
      .sort((a, b) => Number(b.stage_order ?? b.round_number) - Number(a.stage_order ?? a.round_number))[0];
    const winners = matchRows
      .filter((match) => match.round_id === latestRound?.id)
      .map((match) => match.winner_participant_id)
      .filter(Boolean) as string[];
    if (winners.length <= 1) {
      await completeTournament(admin, tournament.id);
      return { ok: true, completed: true };
    }
    const nextRoundNumber = current + 1;
    const pairings = createSingleEliminationPairings(participantRows.map(toPairingParticipant), nextRoundNumber, winners);
    return createRoundAndMatches(admin, tournament, "single_elimination", nextRoundNumber, pairings);
  }

  if (mode === "double_elimination") {
    if (body?.manualPairings?.length || body?.manualPods?.length) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Bracket rounds advance winners automatically" }, { status: 400 }) };
    }
    const nextRoundNumber = current + 1;
    const next = createDoubleEliminationPairings({
      participants: participantRows.map(toPairingParticipant),
      previousMatches,
      roundNumber: nextRoundNumber,
    });
    if (next.complete || next.pairings.length === 0) {
      await completeTournament(admin, tournament.id);
      return { ok: true, completed: true };
    }
    return createRoundAndMatches(admin, tournament, next.phase, nextRoundNumber, next.pairings);
  }

  if (mode === "round_robin") {
    if (body?.manualPairings?.length || body?.manualPods?.length) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Round Robin pairings are automatic" }, { status: 400 }) };
    }
    const activeCount = participantRows.filter((p) => !p.dropped_at).length;
    const totalRounds = activeCount % 2 === 0 ? activeCount - 1 : activeCount;
    if (activeCount > 16) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Round Robin is capped at 16 players" }, { status: 400 }) };
    }
    if (current >= totalRounds) {
      await completeTournament(admin, tournament.id);
      return { ok: true, completed: true };
    }
    return createRoundAndMatches(admin, tournament, "round_robin", current + 1);
  }

  if (mode === "commander_pods") {
    const podRounds = Math.max(1, Math.min(8, Number(tournament.settings?.podRounds ?? 3) || 3));
    if (current >= podRounds) {
      await completeTournament(admin, tournament.id);
      return { ok: true, completed: true };
    }
    const manual = validateManualPods({ participantRows, body });
    if (!manual.ok) return manual;
    return createCommanderPodRound(admin, tournament, current + 1, manual.pods);
  }

  const topCutRounds = roundRows
    .filter((round) => round.phase === "top_cut")
    .sort((a, b) => Number(b.stage_order ?? b.round_number) - Number(a.stage_order ?? a.round_number));
  if (topCutRounds.length > 0) {
    if (body?.manualPairings?.length || body?.manualPods?.length) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Top Cut bracket pairings are automatic" }, { status: 400 }) };
    }
    const latestTopCut = topCutRounds[0];
    const winners = matchRows
      .filter((match) => match.round_id === latestTopCut.id)
      .map((match) => match.winner_participant_id)
      .filter(Boolean) as string[];
    if (winners.length <= 1) {
      await completeTournament(admin, tournament.id);
      return { ok: true, completed: true };
    }
    const nextTopCutRoundNumber = Number(latestTopCut.round_number ?? 1) + 1;
    const topCutPairs = pairWinnerIds(winners);
    const rows: PairingRow[] = topCutPairs.map(({ a, b }, index) => ({
      tableNumber: index + 1,
      playerAId: a,
      playerBId: b,
      status: b ? "pending" : "bye",
      result: b ? null : "a_win",
      winnerParticipantId: b ? null : a,
      bracketSlot: `TC-R${nextTopCutRoundNumber}-M${index + 1}`,
      nextMatchHint: topCutPairs.length > 1 ? `TC-R${nextTopCutRoundNumber + 1}-M${Math.ceil((index + 1) / 2)}` : null,
    }));
    return createRoundAndMatches(admin, tournament, "top_cut", nextTopCutRoundNumber, rows);
  }

  const swissRounds = Number(tournament.settings?.swissRounds ?? 3);
  const topCut = String(tournament.settings?.topCut ?? "none");
  const nextPhase = current >= swissRounds && topCut !== "none" ? "top_cut" : "swiss";
  const nextRound = nextPhase === "top_cut" ? 1 : current + 1;
  if (current >= swissRounds && topCut === "none") {
    if (body?.manualPairings?.length || body?.manualPods?.length) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "Swiss rounds are complete" }, { status: 400 }) };
    }
    await completeTournament(admin, tournament.id);
    return { ok: true, completed: true };
  }
  const manual = validateManualPairings({
    phase: nextPhase,
    roundNumber: nextRound,
    mode,
    participantRows,
    previousMatches,
    body,
  });
  if (!manual.ok) return manual;
  const created = await createRoundAndMatches(admin, tournament, nextPhase, nextRound, manual.pairings);
  return created.ok ? { ok: true, round: created.round } : created;
}

export async function markPodRoundCompleteIfResolved(admin: AdminClient, tournamentId: string, roundId: string) {
  const { data } = await admin.from("tournament_pods").select("id, status").eq("round_id", roundId);
  const pods = (data ?? []) as Array<{ id: string; status: string }>;
  if (!pods.length || pods.some((pod) => pod.status !== "confirmed")) return;
  await admin
    .from("tournament_rounds")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", roundId)
    .eq("tournament_id", tournamentId);
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
