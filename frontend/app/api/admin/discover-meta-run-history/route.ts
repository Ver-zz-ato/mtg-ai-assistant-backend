import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";
import type { MetaSignalsJobDetail } from "@/lib/meta/metaSignalsJobStatus";
import type { MetaSignalsRunLogRow } from "@/lib/meta/metaSignalsRunHistory";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 12;

/**
 * Admin-only: recent meta-signals runs from meta_signals_job_run_log.
 */
export async function GET(req: Request) {
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
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const url = new URL(req.url);
    const limit = Math.min(25, Math.max(1, parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

    const { data, error } = await admin
      .from("meta_signals_job_run_log")
      .select(
        "id, started_at, finished_at, duration_ms, run_result, ok, snapshot_date, pill_mode, compact_summary, summary_json"
      )
      .order("finished_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json(
          {
            ok: true,
            runs: [],
            tableMissing: true,
            message:
              "Table meta_signals_job_run_log not found — apply migration db/migrations/098_meta_signals_job_run_log.sql in Supabase.",
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const runs: MetaSignalsRunLogRow[] = (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        started_at: r.started_at as string,
        finished_at: r.finished_at as string,
        duration_ms: r.duration_ms as number | null,
        run_result: r.run_result as string,
        ok: r.ok as boolean,
        snapshot_date: r.snapshot_date as string | null,
        pill_mode: r.pill_mode as string | null,
        compact_summary: r.compact_summary as string,
        summary_json: r.summary_json as MetaSignalsJobDetail,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        runs,
        limit,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
