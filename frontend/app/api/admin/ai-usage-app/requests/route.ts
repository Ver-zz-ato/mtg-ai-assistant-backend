import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { costUSD } from "@/lib/ai/pricing";
import { AI_USAGE_SOURCE_MANATAP_APP, isAppAiUsageRow } from "@/lib/ai/manatap-client-origin";
import { isAdmin } from "@/lib/admin-check";

const LEGACY_PRICING_CUTOFF = "2026-02-14";
/** Hard cap on rows read from DB per request (admin-only). */
const FETCH_CAP = 3000;

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });

    const sp = req.nextUrl.searchParams;
    const daysRaw = parseInt(sp.get("days") || "7", 10);
    const days = Math.min(90, Math.max(1, isFinite(daysRaw) ? daysRaw : 7));
    const wantLimit = Math.min(500, Math.max(10, parseInt(sp.get("limit") || "80", 10) || 80));
    const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
    const modelFilter = sp.get("model") || undefined;
    const routeFilter = sp.get("route") || undefined;
    const sourcePageFilter = sp.get("source_page") || undefined;
    const requestKindFilter = sp.get("request_kind") || undefined;
    const userIdFilter = sp.get("user_id") || undefined;
    const cacheHitFilter = sp.get("cache_hit") || undefined;
    const errorOnly = sp.get("error_only") === "true";
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
      "source",
      "source_page",
      "input_tokens",
      "output_tokens",
      "cost_usd",
      "pricing_version",
      "prompt_preview",
      "response_preview",
      "layer0_mode",
      "request_kind",
      "user_tier",
      "is_guest",
      "latency_ms",
      "cache_hit",
      "error_code",
      "cache_kind",
      "prompt_path",
      "format_key",
    ].join(",");

    let q = admin
      .from("ai_usage")
      .select(selectCols)
      .gte("created_at", cutoff)
      .or(`source.eq.${AI_USAGE_SOURCE_MANATAP_APP},source_page.like.app%`)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP);

    if (modelFilter) q = q.eq("model", modelFilter);
    if (routeFilter) q = q.eq("route", routeFilter);
    if (sourcePageFilter) q = q.eq("source_page", sourcePageFilter);
    if (requestKindFilter) q = q.eq("request_kind", requestKindFilter);
    if (userIdFilter) q = q.eq("user_id", userIdFilter);
    if (cacheHitFilter === "true") q = q.eq("cache_hit", true);
    if (cacheHitFilter === "false") q = q.eq("cache_hit", false);
    if (errorOnly) q = q.not("error_code", "is", null);
    if (excludeLegacyCost) q = q.gte("pricing_version", LEGACY_PRICING_CUTOFF);

    const { data: batch, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rowsRaw = (Array.isArray(batch) ? batch : []) as unknown[];
    const filtered = rowsRaw.filter((r): r is Record<string, unknown> => r != null && typeof r === "object").filter((r) =>
      isAppAiUsageRow({
        source: r.source as string | null,
        source_page: r.source_page as string | null,
      })
    );

    const windowRows = filtered.slice(offset, offset + wantLimit);

    const userIds = [...new Set(windowRows.map((r) => r.user_id as string).filter(Boolean))];
    const profilesMap = new Map<string, { email?: string; display_name?: string }>();
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email, display_name")
        .in("id", userIds);
      for (const p of profiles || []) {
        const row = p as { id: string; email?: string; display_name?: string };
        profilesMap.set(row.id, { email: row.email, display_name: row.display_name });
      }
    }

    const withUser = windowRows.map((r) => {
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
      total: filtered.length,
      offset,
      limit: wantLimit,
      days,
      filters: {
        model: modelFilter || null,
        route: routeFilter || null,
        source_page: sourcePageFilter || null,
        request_kind: requestKindFilter || null,
        user_id: userIdFilter || null,
        cache_hit: cacheHitFilter || null,
        error_only: errorOnly,
      },
      truncated: (batch || []).length >= FETCH_CAP,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
