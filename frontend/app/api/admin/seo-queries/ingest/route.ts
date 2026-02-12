import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

const MAX_QUERY_LENGTH = 200;
const MAX_ROWS = 5000;

function sanitize(str: string): string {
  return String(str ?? "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { ok: false, error: `Too many rows. Max ${MAX_ROWS}.` },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "admin_client_unavailable" },
        { status: 500 }
      );
    }

    const toUpsert = rows
      .map((r: Record<string, unknown>) => {
        const query = sanitize(String(r.query ?? ""));
        if (!query) return null;
        const clicks = Math.max(0, Number(r.clicks) || 0);
        const impressions = Math.max(0, Number(r.impressions) || 0);
        const ctr = r.ctr != null ? Number(r.ctr) : null;
        const position = r.position != null ? Number(r.position) : null;
        const dateStart = r.date_start ? String(r.date_start).slice(0, 10) : null;
        const dateEnd = r.date_end ? String(r.date_end).slice(0, 10) : null;
        return {
          query,
          clicks,
          impressions,
          ctr,
          position,
          source: String(r.source ?? "gsc").slice(0, 50),
          date_start: dateStart || null,
          date_end: dateEnd || null,
          updated_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    if (toUpsert.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        updated: 0,
        skipped: rows.length,
      });
    }

    const { data, error } = await admin
      .from("seo_queries")
      .upsert(toUpsert, {
        onConflict: "source,query",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const count = Array.isArray(data) ? data.length : 0;
    return NextResponse.json({
      ok: true,
      inserted: count,
      updated: count,
      skipped: rows.length - toUpsert.length,
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
