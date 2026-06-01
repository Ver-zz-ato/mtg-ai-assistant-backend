import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { extractIP } from "@/lib/guest-tracking";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    if (!sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
    }
    const { supabase, user, authError } = await getUserAndSupabase(req);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_user_id")
      .eq("blocker_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("user_blocks_get", error);
      return NextResponse.json({ ok: false, error: "Failed to load blocks" }, { status: 500 });
    }

    const blockedUserIds = Array.isArray(data)
      ? data
          .map((row) => String(row.blocked_user_id || "").trim())
          .filter(Boolean)
      : [];

    return NextResponse.json({ ok: true, blocked_user_ids: blockedUserIds });
  } catch (e: unknown) {
    console.error("user_blocks_get", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
    }
    const burst = checkRateLimit(req, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 40,
      keyGenerator: (request) => `user-blocks-post:${extractIP(request)}`,
    });
    if (!burst.allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited", retryAfter: burst.retryAfter }, { status: 429 });
    }

    const { supabase, user, authError } = await getUserAndSupabase(req);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const blockedUserId = typeof body?.blocked_user_id === "string" ? body.blocked_user_id.trim() : "";
    const action = body?.action === "unblock" ? "unblock" : "block";

    if (!blockedUserId) {
      return NextResponse.json({ ok: false, error: "blocked_user_id_required" }, { status: 400 });
    }
    if (blockedUserId === user.id) {
      return NextResponse.json({ ok: false, error: "cannot_block_self" }, { status: 400 });
    }

    if (action === "block") {
      const { error } = await supabase.from("user_blocks").upsert(
        {
          blocker_user_id: user.id,
          blocked_user_id: blockedUserId,
        },
        { onConflict: "blocker_user_id,blocked_user_id", ignoreDuplicates: false }
      );
      if (error) {
        console.error("user_blocks_block", error);
        return NextResponse.json({ ok: false, error: "Failed to block user" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, blocked: true });
    }

    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_user_id", user.id)
      .eq("blocked_user_id", blockedUserId);

    if (error) {
      console.error("user_blocks_unblock", error);
      return NextResponse.json({ ok: false, error: "Failed to unblock user" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, blocked: false });
  } catch (e: unknown) {
    console.error("user_blocks_post", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
