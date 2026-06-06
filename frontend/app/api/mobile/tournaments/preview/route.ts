import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentActor,
  hashTournamentInviteToken,
  requireTournamentAdmin,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

function inviteTokenFromBody(body: any): string | null {
  const raw = String(body?.inviteUrl ?? body?.token ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return parsed.searchParams.get("tournamentToken") ?? parsed.searchParams.get("token") ?? raw;
  } catch {
    return raw;
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getTournamentActor(req);
    if (!actor.ok) return actor.response;
    const rateLimit = checkTournamentBurstLimit(req, "preview", actor.actor.actorKey);
    if (!rateLimit.allowed) return rateLimit.response;
    const body = await req.json().catch(() => ({}));
    const token = inviteTokenFromBody(body);
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
      .select("tournament_id, expires_at, revoked_at")
      .eq("token_hash", hashTournamentInviteToken(token))
      .maybeSingle();
    if (inviteError) {
      console.error("[mobile/tournaments/preview] invite lookup failed", inviteError);
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "server_error" }, { status: 500 }), rateLimit.rateLimit);
    }
    if (!invite) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 }), rateLimit.rateLimit);
    if (invite.revoked_at) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invite was revoked" }, { status: 410 }), rateLimit.rateLimit);
    if (new Date(String(invite.expires_at)).getTime() <= Date.now()) {
      return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Invite expired" }, { status: 410 }), rateLimit.rateLimit);
    }
    const { data: tournament } = await admin
      .from("tournaments")
      .select("id, title, format, status, settings")
      .eq("id", invite.tournament_id)
      .maybeSingle();
    if (!tournament) return withTournamentRateLimitHeaders(NextResponse.json({ ok: false, error: "Tournament not found" }, { status: 404 }), rateLimit.rateLimit);
    const { count } = await admin
      .from("tournament_participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournament.id);
    return withTournamentRateLimitHeaders(
      NextResponse.json({
        ok: true,
        preview: {
          id: tournament.id,
          title: tournament.title,
          format: tournament.format,
          status: tournament.status,
          settings: tournament.settings ?? {},
          participantCount: count ?? 0,
        },
      }),
      rateLimit.rateLimit,
    );
  } catch (error) {
    console.error("[mobile/tournaments/preview] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
