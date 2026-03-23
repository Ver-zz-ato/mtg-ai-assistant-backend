import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";

export const runtime = "nodejs";

/**
 * POST /api/users/me/push-token
 * Body: { token: string } — Expo push token (ExponentPushToken[...])
 */
export async function POST(req: NextRequest) {
  try {
    const { supabase, user, authError } = await getUserAndSupabase(req);
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token || !token.startsWith("ExponentPushToken")) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 400 });
    }

    const { error } = await supabase.from("user_push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("push_token_upsert", error);
      return NextResponse.json({ ok: false, error: "Failed to save token" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
