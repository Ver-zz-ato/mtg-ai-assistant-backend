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
  const suiteKey = url.searchParams.get("suite_key");
  const category = url.searchParams.get("category");
  const isActive = url.searchParams.get("is_active");

  let query = supabase.from("ai_test_scenarios").select("*").order("scenario_key");
  if (suiteKey) query = query.eq("suite_key", suiteKey);
  if (category) query = query.eq("category", category);
  if (isActive !== null && isActive !== undefined && isActive !== "") {
    query = query.eq("is_active", isActive === "true");
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, scenarios: data ?? [] });
}
