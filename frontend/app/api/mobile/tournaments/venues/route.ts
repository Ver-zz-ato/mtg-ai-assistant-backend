import { NextRequest, NextResponse } from "next/server";

import {
  checkTournamentBurstLimit,
  requireTournamentAdmin,
  requireTournamentUser,
  venueBodySchema,
  withTournamentRateLimitHeaders,
} from "@/lib/mobile/tournaments";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTournamentUser(req);
    if (!auth.ok) return auth.response;
    const rateLimit = checkTournamentBurstLimit(req, "venues", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { data, error } = await admin
      .from("tournament_venues")
      .select("id, name, location, created_at, updated_at")
      .eq("owner_user_id", auth.user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[mobile/tournaments/venues] list failed", error);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to load venues" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, venues: data ?? [] }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/venues] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTournamentUser(req);
    if (!auth.ok) return auth.response;
    const rateLimit = checkTournamentBurstLimit(req, "venue-save", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;
    const parsed = venueBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Invalid venue", details: parsed.error.flatten() }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const payload = {
      owner_user_id: auth.user.id,
      name: parsed.data.name,
      location: parsed.data.location ?? "",
      updated_at: new Date().toISOString(),
    };
    const query = parsed.data.id
      ? admin
          .from("tournament_venues")
          .update(payload)
          .eq("id", parsed.data.id)
          .eq("owner_user_id", auth.user.id)
          .select("id, name, location, created_at, updated_at")
          .single()
      : admin.from("tournament_venues").insert(payload).select("id, name, location, created_at, updated_at").single();
    const { data, error } = await query;
    if (error || !data) {
      console.error("[mobile/tournaments/venues] save failed", error);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to save venue" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, venue: data }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/venues] route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireTournamentUser(req);
    if (!auth.ok) return auth.response;
    const rateLimit = checkTournamentBurstLimit(req, "venue-delete", auth.user.id);
    if (!rateLimit.allowed) return rateLimit.response;
    const venueId = new URL(req.url).searchParams.get("id");
    if (!venueId) {
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Venue id required" }, { status: 400 }),
        rateLimit.rateLimit,
      );
    }
    const admin = requireTournamentAdmin();
    if (admin instanceof NextResponse) return admin;
    const { error } = await admin
      .from("tournament_venues")
      .delete()
      .eq("id", venueId)
      .eq("owner_user_id", auth.user.id);
    if (error) {
      console.error("[mobile/tournaments/venues] delete failed", error);
      return withTournamentRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Failed to delete venue" }, { status: 500 }),
        rateLimit.rateLimit,
      );
    }
    return withTournamentRateLimitHeaders(NextResponse.json({ ok: true, deleted: true }), rateLimit.rateLimit);
  } catch (error) {
    console.error("[mobile/tournaments/venues] delete route error", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
