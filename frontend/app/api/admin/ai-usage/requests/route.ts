import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { costUSD } from "@/lib/ai/pricing";

const LEGACY_PRICING_CUTOFF = "2026-02-14";

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
    const excludeLegacyCost = sp.get("exclude_legacy_cost") === "true";

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const selectCols = [
      "id",
      "created_at",
      "user_id",
      "thread_id",
      "deck_id",
      "model",
      "model_tier",
      "route",
      "prompt_path",
      "format_key",
      "input_tokens",
      "output_tokens",
      "cost_usd",
      "pricing_version",
      "prompt_preview",
      "response_preview",
      "deck_size",
      "context_source",
      "summary_tokens_estimate",
      "deck_hash",
      "layer0_mode",
      "layer0_reason",
      "request_kind",
      "has_deck_context",
      "deck_card_count",
      "used_v2_summary",
      "used_two_stage",
      "planner_model",
      "planner_tokens_in",
      "planner_tokens_out",
      "planner_cost_usd",
      "stop_sequences_enabled",
      "max_tokens_config",
      "response_truncated",
      "user_tier",
      "is_guest",
      "latency_ms",
      "cache_hit",
      "cache_kind",
      "error_code",
      "prompt_tier",
      "system_prompt_token_estimate",
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
    if (excludeLegacyCost) q = q.gte("pricing_version", LEGACY_PRICING_CUTOFF);

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
      const pv = r.pricing_version as string | null | undefined;
      const legacy_cost = !pv || pv < LEGACY_PRICING_CUTOFF;
      const corrected_cost_estimate = legacy_cost
        ? costUSD(String(r.model ?? ""), Number(r.input_tokens) || 0, Number(r.output_tokens) || 0)
        : null;
      return {
        ...r,
        user_email: profile?.email ?? null,
        user_display_name: profile?.display_name ?? null,
        legacy_cost,
        corrected_cost_estimate,
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
