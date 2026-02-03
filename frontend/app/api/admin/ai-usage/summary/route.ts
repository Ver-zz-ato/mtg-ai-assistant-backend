import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[,\s]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[,\s]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  if (!uid && !email) return false;
  if (ids.includes(uid)) return true;
  if (email && emails.includes(email)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const sp = req.nextUrl.searchParams;
    const daysRaw = parseInt(sp.get("days") || "30", 10);
    const days = Math.min(90, Math.max(1, isFinite(daysRaw) ? daysRaw : 30));
    const limitRaw = parseInt(sp.get("limit") || "10000", 10);
    const limit = Math.min(50000, Math.max(100, isFinite(limitRaw) ? limitRaw : 10000));
    const userId = sp.get("userId");
    const threadId = sp.get("threadId");

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let q = supabase
      .from("ai_usage")
      .select("id,user_id,thread_id,model,input_tokens,output_tokens,cost_usd,created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (userId) q = q.eq("user_id", userId);
    if (threadId) q = q.eq("thread_id", threadId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = Array.isArray(data) ? data as any[] : [];

    // Last 3 days cost (separate query so it's accurate regardless of limit)
    let last3DaysCost = 0;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentRows } = await supabase
      .from("ai_usage")
      .select("cost_usd")
      .gte("created_at", threeDaysAgo);
    if (Array.isArray(recentRows)) {
      last3DaysCost = recentRows.reduce((sum: number, r: any) => sum + (Number(r.cost_usd) || 0), 0);
    }

    const totals = { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    const by_model = new Map<string, typeof totals>();
    const by_day = new Map<string, { messages: number; cost_usd: number }>();
    const by_user = new Map<string, typeof totals>();

    for (const r of rows) {
      const it = Number(r.input_tokens || 0);
      const ot = Number(r.output_tokens || 0);
      const c = Number(r.cost_usd || 0);
      totals.messages += 1;
      totals.input_tokens += it;
      totals.output_tokens += ot;
      totals.cost_usd += c;

      const model = String(r.model || "");
      if (!by_model.has(model)) by_model.set(model, { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 });
      const bm = by_model.get(model)!;
      bm.messages += 1; bm.input_tokens += it; bm.output_tokens += ot; bm.cost_usd += c;

      const date = String(r.created_at || "").slice(0, 10);
      if (!by_day.has(date)) by_day.set(date, { messages: 0, cost_usd: 0 });
      const bd = by_day.get(date)!;
      bd.messages += 1; bd.cost_usd += c;

      const uid = String(r.user_id || "");
      if (!by_user.has(uid)) by_user.set(uid, { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 });
      const bu = by_user.get(uid)!;
      bu.messages += 1; bu.input_tokens += it; bu.output_tokens += ot; bu.cost_usd += c;
    }

    const toFixed = (n: number) => Math.round(n * 10000) / 10000;

    const resp = {
      ok: true,
      window_days: days,
      limit,
      filters: { userId: userId || null, threadId: threadId || null },
      recent_days_cost: { last_3_days: toFixed(last3DaysCost) },
      totals: { ...totals, cost_usd: toFixed(totals.cost_usd) },
      by_model: Array.from(by_model.entries()).map(([model, t]) => ({ model, ...t, cost_usd: toFixed(t.cost_usd) })).sort((a,b)=>b.cost_usd-a.cost_usd),
      by_day: Array.from(by_day.entries()).map(([date, t]) => ({ date, ...t, cost_usd: toFixed(t.cost_usd) })).sort((a,b)=>a.date.localeCompare(b.date)),
      top_users: Array.from(by_user.entries()).map(([user_id, t]) => ({ user_id, ...t, cost_usd: toFixed(t.cost_usd) })).sort((a,b)=>b.cost_usd-a.cost_usd).slice(0, 20),
    };

    return NextResponse.json(resp);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}