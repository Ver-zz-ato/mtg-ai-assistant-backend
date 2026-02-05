import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

/**
 * Admin-only GET: cost summary for reconciliation and guardrail impact.
 * Returns by_model, by_feature (route), by_day. Optional ?userId= for shadow billing (today + month).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const daysRaw = parseInt(sp.get("days") ?? "30", 10);
    const days = Math.min(90, Math.max(1, isFinite(daysRaw) ? daysRaw : 30));
    const userIdFilter = sp.get("userId");

    let cutoff: string;
    let toDate: string | null = null;
    if (fromParam && toParam) {
      cutoff = new Date(fromParam + "T00:00:00Z").toISOString();
      toDate = new Date(toParam + "T23:59:59.999Z").toISOString();
    } else {
      cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }

    let q = supabase
      .from("ai_usage")
      .select("model,route,input_tokens,output_tokens,cost_usd,created_at,user_id")
      .gte("created_at", cutoff);
    if (toDate) q = q.lte("created_at", toDate);
    if (userIdFilter) q = q.eq("user_id", userIdFilter);

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const list = Array.isArray(rows) ? rows : [];
    const toFixed = (n: number) => Math.round(n * 10000) / 10000;

    const by_model: Record<string, { messages: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
    const by_feature: Record<string, { messages: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
    const by_day: Record<string, { messages: number; input_tokens: number; output_tokens: number; cost_usd: number }> = {};
    let totals = { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };

    for (const r of list) {
      const it = Number(r.input_tokens ?? 0);
      const ot = Number(r.output_tokens ?? 0);
      const c = Number(r.cost_usd ?? 0);
      totals.messages += 1;
      totals.input_tokens += it;
      totals.output_tokens += ot;
      totals.cost_usd += c;

      const model = String(r.model ?? "unknown");
      if (!by_model[model]) by_model[model] = { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      by_model[model].messages += 1;
      by_model[model].input_tokens += it;
      by_model[model].output_tokens += ot;
      by_model[model].cost_usd += c;

      const route = String(r.route ?? "unknown");
      if (!by_feature[route]) by_feature[route] = { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      by_feature[route].messages += 1;
      by_feature[route].input_tokens += it;
      by_feature[route].output_tokens += ot;
      by_feature[route].cost_usd += c;

      const date = String(r.created_at ?? "").slice(0, 10);
      if (!by_day[date]) by_day[date] = { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      by_day[date].messages += 1;
      by_day[date].input_tokens += it;
      by_day[date].output_tokens += ot;
      by_day[date].cost_usd += c;
    }

    // Shadow billing: for a specific user, return today and month totals
    let user_ai_cost_today_usd: number | null = null;
    let user_ai_cost_month_usd: number | null = null;
    if (userIdFilter) {
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const { data: todayRows } = await supabase
        .from("ai_usage")
        .select("cost_usd")
        .eq("user_id", userIdFilter)
        .gte("created_at", todayStart);
      const { data: monthRows } = await supabase
        .from("ai_usage")
        .select("cost_usd")
        .eq("user_id", userIdFilter)
        .gte("created_at", monthStart);
      user_ai_cost_today_usd = Array.isArray(todayRows)
        ? todayRows.reduce((s, row) => s + (Number(row.cost_usd) || 0), 0)
        : 0;
      user_ai_cost_month_usd = Array.isArray(monthRows)
        ? monthRows.reduce((s, row) => s + (Number(row.cost_usd) || 0), 0)
        : 0;
    }

    const resp: Record<string, unknown> = {
      ok: true,
      from: cutoff,
      to: toDate,
      days: !fromParam || !toParam ? days : undefined,
      filters: { userId: userIdFilter ?? null },
      totals: {
        messages: totals.messages,
        input_tokens: totals.input_tokens,
        output_tokens: totals.output_tokens,
        cost_usd: toFixed(totals.cost_usd),
      },
      by_model: Object.entries(by_model).map(([model, t]) => ({ model, ...t, cost_usd: toFixed(t.cost_usd) }))
        .sort((a, b) => (b.cost_usd as number) - (a.cost_usd as number)),
      by_feature: Object.entries(by_feature).map(([route, t]) => ({ route, ...t, cost_usd: toFixed(t.cost_usd) }))
        .sort((a, b) => (b.cost_usd as number) - (a.cost_usd as number)),
      by_day: Object.entries(by_day).map(([date, t]) => ({ date, ...t, cost_usd: toFixed(t.cost_usd) }))
        .sort((a, b) => (a.date as string).localeCompare(b.date as string)),
    };
    if (userIdFilter != null) {
      resp.shadow_billing = {
        user_id: userIdFilter,
        user_ai_cost_today_usd: toFixed(user_ai_cost_today_usd ?? 0),
        user_ai_cost_month_usd: toFixed(user_ai_cost_month_usd ?? 0),
      };
    }

    return NextResponse.json(resp);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
