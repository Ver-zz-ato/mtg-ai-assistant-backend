import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";
import { parseMetaSignalsJobDetail } from "@/lib/meta/metaSignalsJobStatus";

export const runtime = "nodejs";

const SIGNAL_SAMPLE = [
  "trending-commanders",
  "most-played-commanders",
  "budget-commanders",
  "trending-cards",
  "most-played-cards",
  "new-set-breakouts",
  "discover-meta-label",
] as const;

/**
 * Admin-only: Discover / meta_signals pipeline health for QA (Command Center + Data page).
 */
export async function GET() {
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

    const { data: cfgRows } = await admin
      .from("app_config")
      .select("key, value")
      .in("key", [
        "job:last:meta-signals",
        "job:meta-signals:attempt",
        "job:meta-signals:detail",
      ]);

    const cfg: Record<string, string> = {};
    for (const r of cfgRows ?? []) {
      const row = r as { key: string; value: string };
      cfg[row.key] = row.value;
    }

    const jobDetail = parseMetaSignalsJobDetail(cfg["job:meta-signals:detail"]);

    let commanderDailyYesterday = 0;
    let cardDailyToday = 0;
    try {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      const tStr = new Date().toISOString().slice(0, 10);
      const { count: c1 } = await admin
        .from("meta_commander_daily")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", yStr)
        .eq("source", "scryfall");
      commanderDailyYesterday = c1 ?? 0;
      const { count: c2 } = await admin
        .from("meta_card_daily")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", tStr)
        .eq("source", "scryfall");
      cardDailyToday = c2 ?? 0;
    } catch {
      /* tables may not exist */
    }

    const samples: Record<string, unknown> = {};
    const { data: sigRows } = await admin
      .from("meta_signals")
      .select("signal_type, data, updated_at")
      .in("signal_type", [...SIGNAL_SAMPLE]);

    for (const row of sigRows ?? []) {
      const r = row as { signal_type: string; data: unknown; updated_at?: string };
      const arr = Array.isArray(r.data) ? r.data : [];
      samples[r.signal_type] = {
        updated_at: r.updated_at,
        count: arr.length,
        preview: arr.slice(0, 3),
      };
    }

    const lastSuccess = cfg["job:last:meta-signals"] || null;
    const lastAttempt = cfg["job:meta-signals:attempt"] || null;
    let health: "healthy" | "stale" | "degraded" = "healthy";
    if (!lastSuccess) health = "degraded";
    else {
      const ageMs = Date.now() - new Date(lastSuccess).getTime();
      if (ageMs > 36 * 60 * 60 * 1000) health = "stale";
    }
    if (jobDetail?.ok === false) health = "degraded";

    return NextResponse.json(
      {
        ok: true,
        health,
        lastSuccess,
        lastAttempt,
        jobDetail,
        meta_commander_daily_yesterday_rows: commanderDailyYesterday,
        meta_card_daily_today_rows: cardDailyToday,
        samples,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
