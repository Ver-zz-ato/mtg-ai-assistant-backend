import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

const DEFAULT_THRESHOLD = 10;
const DEFAULT_LIMIT = 50;

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
      const { data: metrics } = await admin
        .from("seo_queries")
        .select("query, clicks, impressions, ctr, position")
        .in("query", queries);

      const byQuery = new Map(
        (metrics || []).map((m: { query: string; clicks: number; impressions: number; ctr?: number; position?: number }) => [
          m.query,
          { clicks: m.clicks ?? 0, impressions: m.impressions ?? 0, ctr: m.ctr ?? null, position: m.position ?? null },
        ])
      );

      for (const p of pages || []) {
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

    return NextResponse.json({ ok: true, winners, threshold });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
