import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const status = req.nextUrl.searchParams.get("status");
    const joinMetrics = req.nextUrl.searchParams.get("join") === "metrics";
    const sort = req.nextUrl.searchParams.get("sort") || "priority_desc";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "200", 10);

    let q = admin.from("seo_pages").select("id, slug, title, template, query, priority, status, commander_slug, card_name, created_at, quality_score, indexing").order("priority", { ascending: false }).limit(limit);

    if (status) q = q.eq("status", status);

    if (sort === "impressions_desc" || sort === "impressions_asc") {
      q = q.order("priority", { ascending: false });
    }

    const { data: pages, error } = await q;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let enriched: Record<string, unknown>[] = (pages ?? []) as Record<string, unknown>[];
    if (joinMetrics && enriched.length > 0) {
      const queries = Array.from(new Set(enriched.map((p) => (p as { query: string }).query)));
      const { data: metrics } = await admin.from("seo_queries").select("query, clicks, impressions").in("query", queries);
      const metricsByQuery = new Map((metrics ?? []).map((m: { query: string; clicks: number; impressions: number }) => [m.query, { clicks: m.clicks, impressions: m.impressions }]));
      enriched = enriched.map((p) => ({
        ...p,
        impressions: metricsByQuery.get((p as { query: string }).query)?.impressions ?? null,
        clicks: metricsByQuery.get((p as { query: string }).query)?.clicks ?? null,
      }));
    }

    if (sort === "impressions_desc") {
      enriched = [...enriched].sort((a, b) => (Number(b.impressions ?? 0) - Number(a.impressions ?? 0)));
    } else if (sort === "impressions_asc") {
      enriched = [...enriched].sort((a, b) => (Number(a.impressions ?? 0) - Number(b.impressions ?? 0)));
    }

    return NextResponse.json({ ok: true, pages: enriched });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
