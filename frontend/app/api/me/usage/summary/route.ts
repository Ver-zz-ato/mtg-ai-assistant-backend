import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const cutoff = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const { data, error } = await supabase
      .from("ai_usage")
      .select("model,input_tokens,output_tokens,cost_usd,created_at")
      .eq("user_id", user.id)
      .gte("created_at", cutoff);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = Array.isArray(data) ? data as any[] : [];
    const totals = rows.reduce((acc, r) => {
      acc.messages += 1;
      acc.input_tokens += Number(r.input_tokens || 0);
      acc.output_tokens += Number(r.output_tokens || 0);
      acc.cost_usd += Number(r.cost_usd || 0);
      return acc;
    }, { messages: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 });

    return NextResponse.json({ ok: true, totals });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}