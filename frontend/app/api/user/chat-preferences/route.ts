import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

/**
 * GET: Fetch user's saved chat preferences (Pro feature).
 */
export async function GET(req: NextRequest) {
  let supabase = await getServerSupabase();
  let { data: { user } } = await supabase.auth.getUser();

  // Bearer fallback for mobile
  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_chat_preferences")
    .select("format, budget, colors, playstyle, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[chat-preferences] GET error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    preferences: data ?? { format: null, budget: null, colors: [], playstyle: null },
  });
}

/**
 * PUT: Save user's chat preferences (Pro feature).
 */
export async function PUT(req: NextRequest) {
  let supabase = await getServerSupabase();
  let { data: { user } } = await supabase.auth.getUser();

  // Bearer fallback for mobile
  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { checkProStatus } = await import("@/lib/server-pro-check");
  const isPro = await checkProStatus(user.id);
  if (!isPro) {
    return NextResponse.json(
      { ok: false, error: "Pro subscription required to save preferences across chats" },
      { status: 403 }
    );
  }

  let body: { format?: string; budget?: string; colors?: string[]; playstyle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.format === "string") update.format = body.format.trim() || null;
  if (typeof body.budget === "string") update.budget = body.budget.trim() || null;
  if (Array.isArray(body.colors)) update.colors = body.colors.filter((c) => typeof c === "string");
  if (typeof body.playstyle === "string") update.playstyle = body.playstyle.trim() || null;

  const { error: upsertError } = await supabase
    .from("user_chat_preferences")
    .upsert(update, { onConflict: "user_id" });

  if (upsertError) {
    console.warn("[chat-preferences] PUT error:", upsertError);
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
