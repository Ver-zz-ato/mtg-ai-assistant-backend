import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  loadTournamentSnapshot,
  requireTournamentAdmin,
  updateTournamentSetupBodySchema,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "snapshot", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    const snapshot = await loadTournamentSnapshot(admin, access.tournament, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "delete", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost || actor.actor.kind !== "user") {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }),
        rateLimit.rateLimit,
      );
    }
    const { error } = await admin.from("tournaments").delete().eq("id", id).eq("host_user_id", actor.actor.user.id);
    if (error) {
      console.error("[mobile/tournaments/[id]] delete failed", error);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to delete tournament" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, deleted: true }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]] delete route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "setup-update", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { id } = await context.params;
    const access = await getTournamentAccess(admin, id, actor.actor);
    if (!access.ok) return access.response;
    if (!access.isHost || actor.actor.kind !== "user") {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Host only" }, { status: 403 }),
        rateLimit.rateLimit,
      );
    }
    if (access.tournament.status !== "registration") {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Tournament setup is locked after start" }, { status: 409 }),
        rateLimit.rateLimit,
      );
    }
    const parsed = updateTournamentSetupBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid tournament setup", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    if (parsed.data.venueId) {
      const { data: venue } = await admin
        .from("tournament_venues")
        .select("id")
        .eq("id", parsed.data.venueId)
        .eq("owner_user_id", actor.actor.user.id)
        .maybeSingle();
      if (!venue) {
        return withTournamentRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 }),
          rateLimit.rateLimit,
        );
      }
    }
    const settings = {
      ...(access.tournament.settings ?? {}),
      ...(typeof parsed.data.playerCap === "number" ? { playerCap: parsed.data.playerCap } : {}),
      ...(parsed.data.mode ? { tournamentMode: parsed.data.mode } : {}),
      ...(typeof parsed.data.swissRounds === "number" ? { swissRounds: parsed.data.swissRounds } : {}),
      ...(parsed.data.topCut ? { topCut: parsed.data.topCut } : {}),
      ...(typeof parsed.data.podRounds === "number" ? { podRounds: parsed.data.podRounds } : {}),
      ...(typeof parsed.data.roundRobinDrawsEnabled === "boolean" ? { roundRobinDrawsEnabled: parsed.data.roundRobinDrawsEnabled } : {}),
      ...(parsed.data.pairingMode ? { pairingMode: parsed.data.pairingMode } : {}),
      ...(typeof parsed.data.decklistsEnabled === "boolean" ? { decklistsEnabled: parsed.data.decklistsEnabled } : {}),
      ...(parsed.data.deckSubmissionMode
        ? { deckSubmissionMode: parsed.data.deckSubmissionMode, decklistsEnabled: parsed.data.deckSubmissionMode !== "off" }
        : {}),
      ...(parsed.data.deckVisibility ? { deckVisibility: parsed.data.deckVisibility } : {}),
      ...(typeof parsed.data.deckLegalityCheckEnabled === "boolean"
        ? { deckLegalityCheckEnabled: parsed.data.deckLegalityCheckEnabled }
        : {}),
    };
    const update: Record<string, unknown> = {
      settings,
      updated_at: new Date().toISOString(),
    };
    if (typeof parsed.data.title === "string") update.title = parsed.data.title;
    if (parsed.data.format) update.format = parsed.data.format;
    if (parsed.data.mode) update.mode = parsed.data.mode;
    if (Object.prototype.hasOwnProperty.call(parsed.data, "venueId")) update.venue_id = parsed.data.venueId ?? null;
    const { data: fresh, error } = await admin
      .from("tournaments")
      .update(update)
      .eq("id", id)
      .eq("host_user_id", actor.actor.user.id)
      .select("*")
      .single();
    if (error || !fresh) {
      console.error("[mobile/tournaments/[id]] setup update failed", error);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to update tournament setup" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    const snapshot = await loadTournamentSnapshot(admin, fresh as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]] setup update route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
