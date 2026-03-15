import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
  const suiteKey = url.searchParams.get("suite_key");

  let query = supabase
    .from("ai_test_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (suiteKey) query = query.eq("suite_key", suiteKey);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, runs: data ?? [] });
}
