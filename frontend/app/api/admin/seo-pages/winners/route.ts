import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

const DEFAULT_THRESHOLD = 10;
const DEFAULT_LIMIT = 50;
const DEFAULT_DAYS = 7;

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const threshold = Math.max(0, parseInt(req.nextUrl.searchParams.get("threshold") || String(DEFAULT_THRESHOLD), 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || String(DEFAULT_LIMIT), 10)));
    const days = Math.min(90, Math.max(0, parseInt(req.nextUrl.searchParams.get("days") || String(DEFAULT_DAYS), 10)));
    const cutoff = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null;

    const { data: pages } = await admin
      .from("seo_pages")
      .select("slug, title, query, priority, indexing")
      .eq("indexing", "noindex")
      .limit(500);

    const queries = Array.from(new Set((pages || []).map((p: { query: string }) => p.query)));
    let winners: Array<{
      slug: string;
      title: string;
      impressions: number;
      clicks: number;
      ctr: number | null;
      position: number | null;
      priority: number;
    }> = [];

    if (queries.length > 0) {
      const { data: rawMetrics } = await admin
        .from("seo_queries")
        .select("query, clicks, impressions, ctr, position, date_end")
        .in("query", queries);

      const metrics = cutoff
        ? (rawMetrics || []).filter(
            (m: { date_end?: string | null }) =>
              !m.date_end || String(m.date_end).slice(0, 10) >= cutoff
          )
        : rawMetrics || [];

      const byQuery = new Map(
        metrics.map((m: { query: string; clicks: number; impressions: number; ctr?: number; position?: number }) => [
          m.query,
          { clicks: m.clicks ?? 0, impressions: m.impressions ?? 0, ctr: m.ctr ?? null, position: m.position ?? null },
        ])
      );

      for (const p of pages ?? []) {
        const m = byQuery.get(p.query);
        if (!m || m.impressions < threshold) continue;
        winners.push({
          slug: p.slug,
          title: p.title ?? p.slug,
          impressions: m.impressions,
          clicks: m.clicks,
          ctr: m.ctr,
          position: m.position,
          priority: p.priority ?? 0,
        });
      }
      winners = winners.sort((a, b) => b.impressions - a.impressions).slice(0, limit);
    }

    return NextResponse.json({ ok: true, winners, threshold, days });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
