import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const evalRunId = url.searchParams.get("eval_run_id");

    if (!evalRunId) {
      return NextResponse.json({ ok: false, error: "eval_run_id required" }, { status: 400 });
    }

    const { data: rows, error } = await supabase
      .from("ai_usage")
      .select("id, route, model, input_tokens, output_tokens, cost_usd, cost_usd_corrected, latency_ms, source, created_at")
      .eq("eval_run_id", evalRunId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const usage = rows || [];
    const totalCostUsd = usage.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
    const totalCostCorrected = usage.reduce((sum, r) => sum + (Number((r as any).cost_usd_corrected) || Number(r.cost_usd) || 0), 0);
    const totalTokensIn = usage.reduce((sum, r) => sum + (Number(r.input_tokens) || 0), 0);
    const totalTokensOut = usage.reduce((sum, r) => sum + (Number(r.output_tokens) || 0), 0);

    const byRoute: Record<string, { count: number; cost_usd: number; tokens_in: number; tokens_out: number }> = {};
    const byModel: Record<string, { count: number; cost_usd: number; tokens_in: number; tokens_out: number }> = {};
    const bySource: Record<string, { count: number; cost_usd: number }> = {};
    const judgeCost = usage
      .filter((r) => (r as any).source === "ai_test_judge" || (r as any).source === "ai_test_pairwise_judge")
      .reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
    const mainCost = totalCostUsd - judgeCost;

    for (const r of usage) {
      const src = (r as any).source || "unknown";
      if (!bySource[src]) bySource[src] = { count: 0, cost_usd: 0 };
      bySource[src].count++;
      bySource[src].cost_usd += Number(r.cost_usd) || 0;
      const route = r.route || "unknown";
      if (!byRoute[route]) byRoute[route] = { count: 0, cost_usd: 0, tokens_in: 0, tokens_out: 0 };
      byRoute[route].count++;
      byRoute[route].cost_usd += Number(r.cost_usd) || 0;
      byRoute[route].tokens_in += Number(r.input_tokens) || 0;
      byRoute[route].tokens_out += Number(r.output_tokens) || 0;

      const model = r.model || "unknown";
      if (!byModel[model]) byModel[model] = { count: 0, cost_usd: 0, tokens_in: 0, tokens_out: 0 };
      byModel[model].count++;
      byModel[model].cost_usd += Number(r.cost_usd) || 0;
      byModel[model].tokens_in += Number(r.input_tokens) || 0;
      byModel[model].tokens_out += Number(r.output_tokens) || 0;
    }

    const avgLatency = usage.length > 0
      ? usage.reduce((sum, r) => sum + (Number(r.latency_ms) || 0), 0) / usage.filter((r) => r.latency_ms != null).length
      : null;

    return NextResponse.json({
      ok: true,
      eval_run_id: evalRunId,
      total_cost_usd: Math.round(totalCostUsd * 1e6) / 1e6,
      total_cost_usd_corrected: Math.round(totalCostCorrected * 1e6) / 1e6,
      total_tokens_in: totalTokensIn,
      total_tokens_out: totalTokensOut,
      judge_cost_usd: Math.round(judgeCost * 1e6) / 1e6,
      main_cost_usd: Math.round(mainCost * 1e6) / 1e6,
      by_route: byRoute,
      by_model: byModel,
      by_source: bySource,
      avg_latency_ms: avgLatency != null ? Math.round(avgLatency) : null,
      row_count: usage.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
