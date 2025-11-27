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

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { evalRunId, results, summary } = body;

    if (!evalRunId) {
      return NextResponse.json({ ok: false, error: "evalRunId required" }, { status: 400 });
    }

    // Results are already saved via the batch route, just update the eval_run meta if needed
    if (summary) {
      const { error: updateError } = await supabase
        .from("eval_runs")
        .update({
          meta: {
            ...summary,
            saved_at: new Date().toISOString(),
          },
        })
        .eq("id", evalRunId);

      if (updateError) {
        console.error("Failed to update eval_run meta:", updateError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}



