import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { data: run, error: runError } = await supabase
    .from("ai_test_runs")
    .select("*")
    .eq("id", id)
    .single();
  if (runError || !run) {
    return NextResponse.json({ ok: false, error: runError?.message ?? "Run not found" }, { status: 404 });
  }
  const { data: results, error: resultsError } = await supabase
    .from("ai_test_run_results")
    .select("*")
    .eq("run_id", id)
    .order("created_at");
  if (resultsError) {
    return NextResponse.json({ ok: false, error: resultsError.message }, { status: 500 });
  }
  const scenarioIds = [...new Set((results ?? []).map((r: { scenario_id: string | null }) => r.scenario_id).filter(Boolean))];
  let scenarios: Record<string, unknown> = {};
  if (scenarioIds.length > 0) {
    const { data: scenarioRows } = await supabase
      .from("ai_test_scenarios")
      .select("*")
      .in("id", scenarioIds);
    for (const s of scenarioRows ?? []) {
      scenarios[s.id] = s;
    }
  }
  return NextResponse.json({
    ok: true,
    run,
    results: results ?? [],
    scenarios,
  });
}
