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
  createSwissPairings,
  createTopCutPairings,
  type TournamentMatchForStandings,
  type TournamentParticipantForPairing,
} from "@/lib/mobile/tournament-engine";
import { containsProfanity } from "@/lib/profanity";

export const TOURNAMENT_INVITE_TTL_DAYS = 30;
export const TOURNAMENT_GUEST_HEADER = "X-Guest-Session-Token";
export const TOURNAMENT_MAX_PLAYERS = 128;

export const tournamentFormatSchema = z.enum(["Commander", "Standard", "Pioneer", "Modern", "Pauper", "Custom"]);
export const topCutSchema = z.enum(["none", "top4", "top8"]);
export const deckSubmissionModeSchema = z.enum(["off", "optional", "required"]);
export const deckVisibilitySchema = z.enum(["host_only", "players"]);

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
  playerCap: z.number().int().min(2).max(TOURNAMENT_MAX_PLAYERS).default(32),
  swissRounds: z.number().int().min(1).max(12).default(3),
  topCut: topCutSchema.default("none"),
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
  status: "registration" | "active" | "completed" | "cancelled";
  structure: "swiss_top_cut";
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

export type TournamentEventRow = {
  id: string;
  tournament_id: string;
  actor_user_id: string | null;
  actor_participant_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
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

export async function loadTournamentSnapshot(admin: AdminClient, tournament: TournamentRow, actor: TournamentActor) {
  const isHost = actor.kind === "user" && tournament.host_user_id === actor.user.id;
  const [{ data: venue }, { data: participants }, { data: rounds }, { data: matches }, { data: invites }, { data: hostEvents }] =
    await Promise.all([
      tournament.venue_id
        ? admin.from("tournament_venues").select("id, name, location").eq("id", tournament.venue_id).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("tournament_participants").select("*").eq("tournament_id", tournament.id).order("seed", { ascending: true }),
      admin.from("tournament_rounds").select("*").eq("tournament_id", tournament.id).order("round_number", { ascending: true }),
      admin.from("tournament_matches").select("*").eq("tournament_id", tournament.id).order("table_number", { ascending: true }),
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
            .in("event_type", ["participant_left", "participant_kicked", "participant_issue", "match_confirmed", "match_disputed", "match_override"])
            .order("created_at", { ascending: false })
            .limit(30)
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
    hostEvents: isHost
      ? ((hostEvents ?? []) as TournamentEventRow[]).map((event) => ({
          id: event.id,
          type: event.event_type,
          actorParticipantId: event.actor_participant_id,
          payload: event.payload ?? {},
          createdAt: event.created_at,
        }))
      : [],
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
