import { NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/server-admin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

function getSupabaseAdmin() {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function GET() {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 500 }
    );
  }

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Total runs
    const { count: totalRuns } = await supabase
      .from("mulligan_advice_runs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo.toISOString());

    // Cost (sum cost_usd for runs that used LLM)
    const { data: costRows } = await supabase
      .from("mulligan_advice_runs")
      .select("cost_usd")
      .gte("created_at", sevenDaysAgo.toISOString());

    let totalCostUsd = 0;
    for (const r of costRows || []) {
      const c = Number(r.cost_usd);
      if (!isNaN(c) && c > 0) totalCostUsd += c;
    }

    // By tier
    const { data: byTier } = await supabase
      .from("mulligan_advice_runs")
      .select("effective_tier")
      .gte("created_at", sevenDaysAgo.toISOString())
      .eq("source", "production_widget");

    const tierCounts: Record<string, number> = { guest: 0, free: 0, pro: 0 };
    for (const r of byTier || []) {
      const t = (r.effective_tier || "guest") as string;
      tierCounts[t] = (tierCounts[t] ?? 0) + 1;
    }

    // By source
    const { data: bySource } = await supabase
      .from("mulligan_advice_runs")
      .select("source")
      .gte("created_at", sevenDaysAgo.toISOString());

    const sourceCounts: Record<string, number> = {};
    for (const r of bySource || []) {
      const s = r.source || "unknown";
      sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
    }

    // Unique users (user_id) and repeat users (>1 run)
    const { data: runs } = await supabase
      .from("mulligan_advice_runs")
      .select("user_id")
      .gte("created_at", sevenDaysAgo.toISOString())
      .eq("source", "production_widget");

    const userRunCount: Record<string, number> = {};
    for (const r of runs || []) {
      const uid = r.user_id || "anon";
      userRunCount[uid] = (userRunCount[uid] ?? 0) + 1;
    }
    const uniqueUsers = Object.keys(userRunCount).length;
    const repeatUsers = Object.values(userRunCount).filter((c) => c > 1).length;
    const topUsers = Object.entries(userRunCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id, count]) => ({ user_id: id, runs: count }));

    // Daily breakdown (last 7 days) with cost
    const { data: dailyRuns } = await supabase
      .from("mulligan_advice_runs")
      .select("created_at, effective_tier, cost_usd")
      .gte("created_at", sevenDaysAgo.toISOString())
      .eq("source", "production_widget");

    const daily: Record<string, { total: number; guest: number; free: number; pro: number; cost_usd: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily[key] = { total: 0, guest: 0, free: 0, pro: 0, cost_usd: 0 };
    }
    for (const r of dailyRuns || []) {
      const key = r.created_at?.slice(0, 10) || "";
      if (!daily[key]) daily[key] = { total: 0, guest: 0, free: 0, pro: 0, cost_usd: 0 };
      daily[key].total++;
      const t = (r.effective_tier || "guest") as "guest" | "free" | "pro";
      if (daily[key][t] !== undefined) daily[key][t]++;
      const c = Number((r as { cost_usd?: number }).cost_usd);
      if (!isNaN(c) && c > 0) daily[key].cost_usd += c;
    }

    const dailySorted = Object.entries(daily).sort((a, b) => b[0].localeCompare(a[0]));

    return NextResponse.json({
      ok: true,
      period: "7d",
      total_runs: totalRuns ?? 0,
      total_cost_usd: totalCostUsd,
      by_tier: tierCounts,
      by_source: sourceCounts,
      unique_users: uniqueUsers,
      repeat_users: repeatUsers,
      top_users: topUsers,
      daily: dailySorted,
    });
  } catch (e: any) {
    console.error("[admin/mulligan/analytics] Error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
