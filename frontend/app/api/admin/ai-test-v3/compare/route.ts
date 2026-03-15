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
  const runA = url.searchParams.get("runA");
  const runB = url.searchParams.get("runB");
  if (!runA || !runB) {
    return NextResponse.json({ ok: false, error: "runA and runB query params required" }, { status: 400 });
  }
  const { data: resultsA } = await supabase
    .from("ai_test_run_results")
    .select("scenario_key, scenario_id, status, score_json")
    .eq("run_id", runA);
  const { data: resultsB } = await supabase
    .from("ai_test_run_results")
    .select("scenario_key, scenario_id, status, score_json")
    .eq("run_id", runB);
  const byKeyA = new Map((resultsA ?? []).map((r: { scenario_key: string }) => [r.scenario_key, r]));
  const byKeyB = new Map((resultsB ?? []).map((r: { scenario_key: string }) => [r.scenario_key, r]));
  const allKeys = new Set([...byKeyA.keys(), ...byKeyB.keys()]);
  const newFailures: string[] = [];
  const newPasses: string[] = [];
  const deltas: Array<{ scenario_key: string; statusA: string; statusB: string }> = [];
  for (const key of allKeys) {
    const a = byKeyA.get(key) as { status: string } | undefined;
    const b = byKeyB.get(key) as { status: string } | undefined;
    const statusA = a?.status ?? "—";
    const statusB = b?.status ?? "—";
    deltas.push({ scenario_key: key, statusA, statusB });
    if (a && b) {
      const passA = a.status === "PASS" || a.status === "WARN";
      const passB = b.status === "PASS" || b.status === "WARN";
      if (passA && !passB) newFailures.push(key);
      if (!passA && passB) newPasses.push(key);
    }
  }
  const { data: runARow } = await supabase.from("ai_test_runs").select("id, suite_key, started_at, passed, failed").eq("id", runA).single();
  const { data: runBRow } = await supabase.from("ai_test_runs").select("id, suite_key, started_at, passed, failed").eq("id", runB).single();
  return NextResponse.json({
    ok: true,
    runA: runARow,
    runB: runBRow,
    newFailures,
    newPasses,
    deltas,
  });
}
