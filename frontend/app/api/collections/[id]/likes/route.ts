import { NextRequest, NextResponse } from "next/server";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";
import crypto from "node:crypto";

export const runtime = "nodejs";

type Params = { id: string };

function ipHashFromReq(req: NextRequest): string | null {
  try {
    const fwd = req.headers.get("x-forwarded-for") || "";
    const ip = fwd.split(",")[0].trim() || "";
    if (!ip) return null;
    return crypto.createHash("sha256").update(ip).digest("hex");
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const { supabase, user } = await getUserAndSupabase(req);
  let count = 0;
  let liked = false;
  try {
    const { count: c } = await supabase
      .from("collection_likes")
      .select("collection_id", { count: "exact", head: true })
      .eq("collection_id", id);
    count = c || 0;
  } catch {
    /* table may not exist yet */
  }
  if (user) {
    try {
      const { count: c } = await supabase
        .from("collection_likes")
        .select("collection_id", { count: "exact", head: true })
        .eq("collection_id", id)
        .eq("user_id", user.id);
      liked = (c || 0) > 0;
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({ ok: true, count, liked });
}

export async function POST(req: NextRequest, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  if (!sameOriginOrBearerPresent(req)) {
    return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }
  const { supabase, user, authError } = await getUserAndSupabase(req);
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = (body?.action || "toggle") as "like" | "unlike" | "toggle";
    const ipHash = ipHashFromReq(req);

    const { count: exists } = await supabase
      .from("collection_likes")
      .select("collection_id", { count: "exact", head: true })
      .eq("collection_id", id)
      .eq("user_id", user.id);

    if ((action === "toggle" && (exists || 0) > 0) || action === "unlike") {
      await supabase.from("collection_likes").delete().eq("collection_id", id).eq("user_id", user.id);
    } else if (action === "like" || action === "toggle") {
      await supabase.from("collection_likes").insert({ collection_id: id, user_id: user.id, ip_hash: ipHash });
    }

    const [{ count: c }, { count: lc }] = await Promise.all([
      supabase.from("collection_likes").select("collection_id", { count: "exact", head: true }).eq("collection_id", id),
      supabase
        .from("collection_likes")
        .select("collection_id", { count: "exact", head: true })
        .eq("collection_id", id)
        .eq("user_id", user.id),
    ]);
    return NextResponse.json({ ok: true, count: c || 0, liked: (lc || 0) > 0 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
