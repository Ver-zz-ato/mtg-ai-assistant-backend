import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdmin } from "@/lib/admin-check";
import {
  computeLeaderboard,
  computeMovers,
  dateRangeUtcDays,
  ROLLUP_SOURCE,
  ROLLUP_TW_CARD_POPULAR,
  ROLLUP_TW_COMMANDER,
  type LeaderRow,
  type RawEntityDay,
} from "@/lib/meta/discoverMetaRollups";

export const runtime = "nodejs";

const PAGE = 1000;

async function fetchAllCommanderRows(admin: SupabaseClient, start: string, end: string): Promise<RawEntityDay[]> {
  const out: RawEntityDay[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("meta_commander_daily")
      .select("snapshot_date, commander_name, commander_name_norm, rank")
      .eq("source", ROLLUP_SOURCE)
      .eq("time_window", ROLLUP_TW_COMMANDER)
      .gte("snapshot_date", start)
      .lte("snapshot_date", end)
      .order("snapshot_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      snapshot_date: string;
      commander_name: string;
      commander_name_norm: string;
      rank: number | null;
    }[];
    for (const r of rows) {
      out.push({
        snapshot_date: r.snapshot_date,
        name: r.commander_name,
        name_norm: r.commander_name_norm,
        rank: r.rank,
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function fetchAllCardRows(admin: SupabaseClient, start: string, end: string): Promise<RawEntityDay[]> {
  const out: RawEntityDay[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("meta_card_daily")
      .select("snapshot_date, card_name, card_name_norm, rank")
      .eq("source", ROLLUP_SOURCE)
      .eq("time_window", ROLLUP_TW_CARD_POPULAR)
      .gte("snapshot_date", start)
      .lte("snapshot_date", end)
      .order("snapshot_date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      snapshot_date: string;
      card_name: string;
      card_name_norm: string;
      rank: number | null;
    }[];
    for (const r of rows) {
      out.push({
        snapshot_date: r.snapshot_date,
        name: r.card_name,
        name_norm: r.card_name_norm,
        rank: r.rank,
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/**
 * Admin-only: historical rollups from daily snapshot tables (no impact on live Discover).
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

    const now = new Date();
    const w7 = dateRangeUtcDays(now, 7);
    const w30 = dateRangeUtcDays(now, 30);

    let cmd7: RawEntityDay[] = [];
    let cmd30: RawEntityDay[] = [];
    let card7: RawEntityDay[] = [];
    let card30: RawEntityDay[] = [];
    let fetchError: string | null = null;

    try {
      const rows = await Promise.all([
        fetchAllCommanderRows(admin, w7.start, w7.end),
        fetchAllCommanderRows(admin, w30.start, w30.end),
        fetchAllCardRows(admin, w7.start, w7.end),
        fetchAllCardRows(admin, w30.start, w30.end),
      ]);
      cmd7 = rows[0];
      cmd30 = rows[1];
      card7 = rows[2];
      card30 = rows[3];
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e);
    }

    const caveats: string[] = [];
    if (fetchError) {
      caveats.push(`Daily table read failed: ${fetchError}`);
    }
    const distinctCmdDays = new Set(cmd30.map((r) => r.snapshot_date)).size;
    if (distinctCmdDays < 2) {
      caveats.push(
        "Fewer than 2 distinct daily snapshots in the last 30 days — movers and averages will be thin until more cron runs accumulate."
      );
    }

    const commanders7d = computeLeaderboard(cmd7, w7.start, w7.end, 24);
    const commanders30d = computeLeaderboard(cmd30, w30.start, w30.end, 24);
    const movers7d = computeMovers(cmd7, w7.start, w7.end, 12);
    const cards7d = computeLeaderboard(card7, w7.start, w7.end, 24);
    const cards30d = computeLeaderboard(card30, w30.start, w30.end, 24);

    const pickTop = (rows: LeaderRow[], n: number) => rows.slice(0, n);

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        windows: {
          d7: w7,
          d30: w30,
        },
        source: {
          commander: { table: "meta_commander_daily", source: ROLLUP_SOURCE, timeWindow: ROLLUP_TW_COMMANDER },
          card: { table: "meta_card_daily", source: ROLLUP_SOURCE, timeWindow: ROLLUP_TW_CARD_POPULAR },
        },
        rowCounts: {
          commanderRows7: cmd7.length,
          commanderRows30: cmd30.length,
          cardRows7: card7.length,
          cardRows30: card30.length,
          distinctCommanderSnapshotDays30: distinctCmdDays,
        },
        commanders: {
          leaders7d: commanders7d,
          leaders30d: commanders30d,
          movers7d,
        },
        cards: {
          leaders7d: cards7d,
          leaders30d: cards30d,
        },
        newSetBreakouts: {
          available: false,
          message:
            "New-set commanders are not tagged in daily snapshot tables; use current meta_signals.new-set-breakouts for the live list. Historical series would need a dedicated column or table.",
        },
        commandCenterPreview: {
          topCommanders7d: pickTop(commanders7d, 3),
          topMovers7dRisers: movers7d.risers.slice(0, 3),
        },
        caveats,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
