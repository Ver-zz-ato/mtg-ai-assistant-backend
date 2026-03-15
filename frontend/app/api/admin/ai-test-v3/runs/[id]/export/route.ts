import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const format = (body.format as string) ?? "json"; // json | csv
  const { data: run, error: runError } = await supabase
    .from("ai_test_runs")
    .select("*")
    .eq("id", id)
    .single();
  if (runError || !run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }
  const { data: results, error: resultsError } = await supabase
    .from("ai_test_run_results")
    .select("*")
    .eq("run_id", id)
    .order("created_at");
  if (resultsError) {
    return NextResponse.json({ ok: false, error: resultsError.message }, { status: 500 });
  }
  if (format === "csv") {
    const header = "scenario_key,status,hard_failures_count,soft_failures_count,prompt_excerpt_length,output_length\n";
    const rows = (results ?? []).map((r: { scenario_key: string; status: string; hard_failures_json: unknown[]; soft_failures_json: unknown[]; prompt_excerpt: string | null; output_text: string | null }) => {
      const hc = Array.isArray(r.hard_failures_json) ? r.hard_failures_json.length : 0;
      const sc = Array.isArray(r.soft_failures_json) ? r.soft_failures_json.length : 0;
      const pl = (r.prompt_excerpt ?? "").length;
      const ol = (r.output_text ?? "").length;
      return `${r.scenario_key},${r.status},${hc},${sc},${pl},${ol}`;
    });
    const csv = header + rows.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="ai-test-v3-run-${id}.csv"`,
      },
    });
  }
  const payload = { run, results: results ?? [] };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ai-test-v3-run-${id}.json"`,
    },
  });
}
