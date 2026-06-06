import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  getTournamentAccess,
  getTournamentActor,
  requireTournamentAdmin,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
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
      console.error("[mobile/tournaments/[id]/delete] delete failed", error);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to delete tournament" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, deleted: true }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/[id]/delete] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
