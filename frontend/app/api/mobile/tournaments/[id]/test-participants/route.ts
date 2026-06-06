import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  addTestParticipantsBodySchema,
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  requireTournamentAdmin,
  TOURNAMENT_MAX_PLAYERS,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

const TEST_NAMES = [
  "Mana Drain Brian",
  "Landy Savage",
  "Tapzilla",
  "Counterspell Steve",
  "Mulligan Morgan",
  "Stack Attack Jack",
  "Cryptic Rick",
  "Treasure Steveasure",
  "Fetch McFetchface",
  "Rhystic Biscuit",
  "Priority Patty",
  "Topdeck Timothy",
  "Rule Zero Hero",
  "Combo Wombo",
  "The Mana Manager",
  "Pass Turn Percy",
  "Draw Step Debra",
  "Mono Red Fred",
  "Island Enjoyer",
  "Forest Fella",
  "Plains Pain",
  "Mountain Deweller",
  "Always Has It",
  "Boardwipe Brenda",
  "Turbo Fog Tina",
  "Storm Count Steve",
  "Life Total Larry",
  "Sol Ring Sally",
  "Niv Mizzet Fizzet",
  "Atraxa Proliferaction",
  "Omnath and Furious",
  "Boseiju Later",
  "No Land Nolan",
  "Keep Seven Kevin",
  "Oops All Spells",
  "Dice Hoarder",
  "Selesnya Sneeze",
  "Izzet Already",
  "Temur Temper",
  "Snapcaster Disaster",
  "Myr Murphy",
];

const TEST_DECK_NAMES = [
  "Sleeved Up Shenanigans",
  "Tap Draw Go Again",
  "Three Lands And Hope",
  "Definitely Not Combo",
  "Value Pile Deluxe",
  "Combat Math Homework",
  "Keepable Seven",
  "Emergency Boardwipe",
  "One More Trigger",
  "Table Politics 101",
];

const FALLBACK_COLORS = ["#d6b35a", "#60a5fa", "#34d399", "#f472b6", "#fb923c", "#a78bfa"];

function syntheticGuestHash(tournamentId: string, index: number): string {
  return createHash("sha256").update(`tournament-test-player:${tournamentId}:${index}`).digest("hex");
}

function pick<T>(items: T[], index: number): T {
  return items[index % items.length]!;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "test-participants", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = addTestParticipantsBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invalid test player count" }, { status: 400 }), rateLimit.rateLimit);
    }

    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost || actor.actor.kind !== "user") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }), rateLimit.rateLimit);
    }
    if (access.tournament.status !== "registration") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Add test players before starting the tournament" }, { status: 409 }), rateLimit.rateLimit);
    }

    const playerCap = Math.min(Number(access.tournament.settings?.playerCap ?? TOURNAMENT_MAX_PLAYERS) || TOURNAMENT_MAX_PLAYERS, TOURNAMENT_MAX_PLAYERS);
    const { data: existingRows, error: existingError } = await admin
      .from("tournament_participants")
      .select("id, seed")
      .eq("tournament_id", id)
      .order("seed", { ascending: true });
    if (existingError) {
      console.error("[mobile/tournaments/test-participants] participant lookup failed", existingError);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to count players" }, { status: 500 }), rateLimit.rateLimit);
    }

    const existingCount = existingRows?.length ?? 0;
    const slots = Math.max(0, playerCap - existingCount);
    const count = Math.min(parsed.data.count, slots);
    if (count <= 0) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Tournament is full" }, { status: 409 }), rateLimit.rateLimit);
    }

    const { data: artRows } = await admin
      .from("scryfall_cache")
      .select("name, normal, art_crop")
      .ilike("type_line", "%Legendary%Creature%")
      .not("normal", "is", null)
      .limit(50);
    const commanderArts = (artRows ?? []).filter((row: any) => row?.normal || row?.art_crop);
    const deckMode = String(access.tournament.settings?.deckSubmissionMode ?? (access.tournament.settings?.decklistsEnabled === false ? "off" : "optional"));
    const deckRequired = deckMode === "required";
    const nextSeed = existingCount + 1;
    const rows = Array.from({ length: count }, (_, offset) => {
      const seed = nextSeed + offset;
      const name = `${pick(TEST_NAMES, seed - 1)} ${seed}`;
      const art = commanderArts.length ? pick(commanderArts, seed - 1) as any : null;
      return {
        tournament_id: id,
        user_id: null,
        guest_key_hash: syntheticGuestHash(id, seed),
        display_name: name,
        art: art
          ? {
              source: "scryfall",
              imageUrl: art.art_crop || art.normal,
              title: art.name,
            }
          : {
              source: "color",
              colorHex: pick(FALLBACK_COLORS, seed - 1),
              title: "Test player",
            },
        deck_id: null,
        deck_name: deckMode === "off" ? null : pick(TEST_DECK_NAMES, seed - 1),
        deck_source: deckRequired ? "pasted" : "none",
        decklist_text: deckRequired ? "1 Sol Ring\n1 Command Tower\n1 Arcane Signet" : null,
        deck_cards: deckRequired
          ? [
              { name: "Sol Ring", qty: 1, zone: "mainboard" },
              { name: "Command Tower", qty: 1, zone: "mainboard" },
              { name: "Arcane Signet", qty: 1, zone: "mainboard" },
            ]
          : [],
        deck_submitted_at: deckRequired ? new Date().toISOString() : null,
        deck_updated_at: deckRequired ? new Date().toISOString() : null,
        seed,
      };
    });

    const { error } = await admin.from("tournament_participants").insert(rows);
    if (error) {
      console.error("[mobile/tournaments/test-participants] insert failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to add test players" }, { status: 500 }), rateLimit.rateLimit);
    }

    await admin.from("tournament_events").insert({
      tournament_id: id,
      actor_user_id: actor.actor.user.id,
      event_type: "test_participants_added",
      payload: { count },
    });

    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot, added: count }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/test-participants] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
