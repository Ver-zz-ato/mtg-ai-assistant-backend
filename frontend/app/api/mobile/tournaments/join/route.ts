import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getInviteTokenFromJoinBody,
  getTournamentActor,
  hashTournamentInviteToken,
  joinTournamentBodySchema,
  loadTournamentSnapshot,
  requireTournamentAdmin,
  resolveTournamentDeckSubmission,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "join", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = joinTournamentBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid join details", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const token = getInviteTokenFromJoinBody(parsed.data);
    if (!token) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid invite token" }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { data: invite, error: inviteError } = await admin
      .from("tournament_invites")
      .select("id, tournament_id, expires_at, revoked_at")
      .eq("token_hash", hashTournamentInviteToken(token))
      .maybeSingle();
    if (inviteError) {
      console.error("[mobile/tournaments/join] invite lookup failed", inviteError);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }), rateLimit.rateLimit);
    }
    if (!invite) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 }), rateLimit.rateLimit);
    if (invite.revoked_at) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invite was revoked" }, { status: 410 }), rateLimit.rateLimit);
    if (new Date(String(invite.expires_at)).getTime() <= Date.now()) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invite expired" }, { status: 410 }), rateLimit.rateLimit);
    }
    const { data: tournament } = await admin.from("tournaments").select("*").eq("id", invite.tournament_id).maybeSingle();
    if (!tournament) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 }), rateLimit.rateLimit);
    const existingFilter =
      actor.actor.kind === "user"
        ? admin.from("tournament_participants").select("*").eq("tournament_id", tournament.id).eq("user_id", actor.actor.user.id)
        : admin.from("tournament_participants").select("*").eq("tournament_id", tournament.id).eq("guest_key_hash", actor.actor.guestKeyHash);
    const { data: existing } = await existingFilter.maybeSingle();
    if (existing?.dropped_at) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "You have left or been removed from this tournament" }, { status: 403 }), rateLimit.rateLimit);
    }
    if (existing && tournament.status !== "registration") {
      const snapshot = await loadTournamentSnapshot(admin, tournament as any, actor.actor);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot, rejoined: true }), rateLimit.rateLimit);
    }
    if (tournament.status !== "registration") {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Registration is closed" }, { status: 409 }), rateLimit.rateLimit);
    }
    const playerCap = Number(tournament.settings?.playerCap ?? 32);
    const { count } = await admin
      .from("tournament_participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournament.id);
    if (!existing && (count ?? 0) >= playerCap) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Tournament is full" }, { status: 409 }), rateLimit.rateLimit);
    }
    const deckSubmission = await resolveTournamentDeckSubmission(admin, tournament as any, actor.actor, parsed.data);
    if (!deckSubmission.ok) return withTournamentRateLimitHeaders(deckSubmission.response, rateLimit.rateLimit);
    const payload = {
      tournament_id: tournament.id,
      user_id: actor.actor.kind === "user" ? actor.actor.user.id : null,
      guest_key_hash: actor.actor.kind === "guest" ? actor.actor.guestKeyHash : null,
      display_name: parsed.data.displayName,
      art: parsed.data.art,
      ...deckSubmission.deck,
      seed: existing?.seed ?? (count ?? 0) + 1,
    };
    const query = existing
      ? admin.from("tournament_participants").update(payload).eq("id", existing.id).select("*").single()
      : admin.from("tournament_participants").insert(payload).select("*").single();
    const { error } = await query;
    if (error) {
      console.error("[mobile/tournaments/join] participant upsert failed", error);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Failed to join tournament" }, { status: 500 }), rateLimit.rateLimit);
    }
    const snapshot = await loadTournamentSnapshot(admin, tournament as any, actor.actor);
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, tournament: snapshot }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/join] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
