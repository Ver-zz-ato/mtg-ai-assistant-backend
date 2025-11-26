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

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const testCaseId = url.searchParams.get("testCaseId");
    const evalRunId = url.searchParams.get("evalRunId");
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));

    let query = supabase.from("ai_test_results").select("*").order("created_at", { ascending: false }).limit(limit);

    if (testCaseId) {
      query = query.eq("test_case_id", testCaseId);
    }
    if (evalRunId) {
      query = query.eq("eval_run_id", evalRunId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, results: data || [] });
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
    const { testCaseId, responseText, promptUsed, validationResults, manualReviewStatus, manualReviewNotes } = body;

    if (!testCaseId || !responseText) {
      return NextResponse.json({ ok: false, error: "testCaseId and responseText required" }, { status: 400 });
    }

    const bodyData: any = {
      test_case_id: testCaseId,
      response_text: responseText,
      prompt_used: promptUsed || null,
      validation_results: validationResults || null,
      manual_review_status: manualReviewStatus || "pending",
      manual_review_notes: manualReviewNotes || null,
    };

    // Add optional fields if provided
    if (body.prompt_version_id) bodyData.prompt_version_id = body.prompt_version_id;
    if (body.eval_run_id) bodyData.eval_run_id = body.eval_run_id;

    const { data, error } = await supabase
      .from("ai_test_results")
      .insert(bodyData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
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
    const { id, manualReviewStatus, manualReviewNotes } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }

    const updateData: any = {};
    if (manualReviewStatus !== undefined) updateData.manual_review_status = manualReviewStatus;
    if (manualReviewNotes !== undefined) updateData.manual_review_notes = manualReviewNotes;

    const { data, error } = await supabase.from("ai_test_results").update(updateData).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

