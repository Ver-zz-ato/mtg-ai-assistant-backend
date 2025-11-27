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
    const limit = parseInt(url.searchParams.get("limit") || "20");

    // Get recent eval runs with their results
    const { data: runs, error } = await supabase
      .from("eval_runs")
      .select(`
        id,
        suite,
        status,
        created_at,
        meta,
        ai_test_results (
          id,
          test_case_id,
          response_text,
          validation_results,
          created_at
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Format history
    const history = (runs || []).map((run: any) => ({
      id: run.id,
      suite: run.suite,
      status: run.status,
      createdAt: run.created_at,
      passRate: run.meta?.pass_rate || 0,
      testCount: run.meta?.test_count || 0,
      passCount: run.meta?.pass_count || 0,
      failCount: run.meta?.fail_count || 0,
      promptVersion: run.meta?.prompt_version || "unknown",
      results: run.ai_test_results || [],
    }));

    return NextResponse.json({ ok: true, history });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}



