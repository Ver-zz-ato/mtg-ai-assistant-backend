import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("ai_test_regressions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, regressions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  let body: {
    source_run_id?: string;
    source_result_id?: string;
    title?: string;
    bug_type?: string;
    scenario_definition_json?: object;
    expected_fix_notes?: string;
    severity?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("ai_test_regressions")
    .insert({
      source_run_id: body.source_run_id ?? null,
      source_result_id: body.source_result_id ?? null,
      title: body.title,
      bug_type: body.bug_type ?? null,
      scenario_definition_json: body.scenario_definition_json ?? {},
      expected_fix_notes: body.expected_fix_notes ?? null,
      severity: body.severity ?? null,
      is_active: true,
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, regression: data });
}
