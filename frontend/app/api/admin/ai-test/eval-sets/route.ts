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

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { data: sets, error } = await supabase
      .from("ai_eval_sets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const setIds = (sets || []).map((s: any) => s.id);
    const { data: runs } = setIds.length > 0
      ? await supabase
          .from("ai_eval_set_runs")
          .select("id, eval_set_id, pass, meta, created_at")
          .in("eval_set_id", setIds)
          .order("created_at", { ascending: false })
      : { data: [] };
    const lastRunBySet: Record<string, any> = {};
    for (const r of runs || []) {
      if (!lastRunBySet[r.eval_set_id]) lastRunBySet[r.eval_set_id] = r;
    }

    const setsWithLastRun = (sets || []).map((s: any) => ({
      ...s,
      last_run: lastRunBySet[s.id] ?? null,
    }));

    return NextResponse.json({ ok: true, sets: setsWithLastRun });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      name,
      description,
      type,
      test_case_ids,
      strict,
      min_overall_score,
      require_critical_violations_zero,
      max_critical_violations,
      max_total_violations,
      min_specificity_score,
      min_actionability_score,
      min_format_legality_score,
      require_clarifying_question_when_missing_info,
      require_refusal_on_illegal_request,
      difficulty_preset,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
    }

    const insertPayload: Record<string, unknown> = {
      name: name.trim(),
      description: description || null,
      type: type || "mixed",
      test_case_ids: Array.isArray(test_case_ids) ? test_case_ids : [],
      strict: strict !== false,
      min_overall_score: typeof min_overall_score === "number" ? min_overall_score : 80,
      require_critical_violations_zero: require_critical_violations_zero !== false,
    };
    if (max_critical_violations !== undefined) insertPayload.max_critical_violations = max_critical_violations;
    if (max_total_violations !== undefined) insertPayload.max_total_violations = max_total_violations;
    if (min_specificity_score !== undefined) insertPayload.min_specificity_score = min_specificity_score;
    if (min_actionability_score !== undefined) insertPayload.min_actionability_score = min_actionability_score;
    if (min_format_legality_score !== undefined) insertPayload.min_format_legality_score = min_format_legality_score;
    if (require_clarifying_question_when_missing_info !== undefined) insertPayload.require_clarifying_question_when_missing_info = require_clarifying_question_when_missing_info;
    if (require_refusal_on_illegal_request !== undefined) insertPayload.require_refusal_on_illegal_request = require_refusal_on_illegal_request;
    if (difficulty_preset !== undefined) insertPayload.difficulty_preset = difficulty_preset;

    const { data: set, error } = await supabase
      .from("ai_eval_sets")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, set });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      id,
      name,
      description,
      type,
      test_case_ids,
      strict,
      min_overall_score,
      require_critical_violations_zero,
      max_critical_violations,
      max_total_violations,
      min_specificity_score,
      min_actionability_score,
      min_format_legality_score,
      require_clarifying_question_when_missing_info,
      require_refusal_on_illegal_request,
      difficulty_preset,
    } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (type !== undefined) updates.type = type;
    if (test_case_ids !== undefined) updates.test_case_ids = Array.isArray(test_case_ids) ? test_case_ids : [];
    if (strict !== undefined) updates.strict = strict;
    if (min_overall_score !== undefined) updates.min_overall_score = min_overall_score;
    if (require_critical_violations_zero !== undefined) updates.require_critical_violations_zero = require_critical_violations_zero;
    if (max_critical_violations !== undefined) updates.max_critical_violations = max_critical_violations;
    if (max_total_violations !== undefined) updates.max_total_violations = max_total_violations;
    if (min_specificity_score !== undefined) updates.min_specificity_score = min_specificity_score;
    if (min_actionability_score !== undefined) updates.min_actionability_score = min_actionability_score;
    if (min_format_legality_score !== undefined) updates.min_format_legality_score = min_format_legality_score;
    if (require_clarifying_question_when_missing_info !== undefined) updates.require_clarifying_question_when_missing_info = require_clarifying_question_when_missing_info;
    if (require_refusal_on_illegal_request !== undefined) updates.require_refusal_on_illegal_request = require_refusal_on_illegal_request;
    if (difficulty_preset !== undefined) updates.difficulty_preset = difficulty_preset;

    const { data: set, error } = await supabase
      .from("ai_eval_sets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, set });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }

    const { error } = await supabase.from("ai_eval_sets").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
