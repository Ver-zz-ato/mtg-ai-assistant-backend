import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

function isAdmin(user: unknown): boolean {
  const u = user as { id?: string; email?: string } | null;
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[,\s]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[,\s]+/).filter(Boolean).map((s) => s.toLowerCase());
  const uid = String(u?.id || "");
  const email = String(u?.email || "").toLowerCase();
  if (!uid && !email) return false;
  if (ids.includes(uid)) return true;
  if (email && emails.includes(email)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const sp = req.nextUrl.searchParams;
    const daysRaw = parseInt(sp.get("days") || "7", 10);
    const days = Math.min(90, Math.max(1, isFinite(daysRaw) ? daysRaw : 7));
    const limitRaw = parseInt(sp.get("limit") || "500", 10);
    const limit = Math.min(2000, Math.max(10, isFinite(limitRaw) ? limitRaw : 500));
    const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10));
    const userId = sp.get("userId") || undefined;
    const threadId = sp.get("threadId") || undefined;
    const modelFilter = sp.get("model") || undefined;
    const routeFilter = sp.get("route") || undefined;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const selectCols = [
      "id",
      "user_id",
      "thread_id",
      "model",
      "model_tier",
      "route",
      "prompt_path",
      "format_key",
      "input_tokens",
      "output_tokens",
      "cost_usd",
      "prompt_preview",
      "response_preview",
      "created_at",
    ].join(",");

    let q = supabase
      .from("ai_usage")
      .select(selectCols, { count: "exact" })
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) q = q.eq("user_id", userId);
    if (threadId) q = q.eq("thread_id", threadId);
    if (modelFilter) q = q.eq("model", modelFilter);
    if (routeFilter) q = q.eq("route", routeFilter);

    const { data: rows, error, count } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const list = (Array.isArray(rows) ? rows : []) as unknown as Record<string, unknown>[];

    // Optional: resolve user emails/display names for display
    const userIds = [...new Set(list.map((r) => r.user_id as string).filter(Boolean))];
    const profilesMap = new Map<string, { email?: string; display_name?: string }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, display_name")
        .in("id", userIds);
      for (const p of profiles || []) {
        const row = p as { id: string; email?: string; display_name?: string };
        profilesMap.set(row.id, { email: row.email, display_name: row.display_name });
      }
    }

    const withUser = list.map((r) => {
      const profile = r.user_id ? profilesMap.get(r.user_id as string) : undefined;
      return {
        ...r,
        user_email: profile?.email ?? null,
        user_display_name: profile?.display_name ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      requests: withUser,
      total: count ?? list.length,
      offset,
      limit,
      days,
      filters: { userId: userId || null, threadId: threadId || null, model: modelFilter || null, route: routeFilter || null },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
