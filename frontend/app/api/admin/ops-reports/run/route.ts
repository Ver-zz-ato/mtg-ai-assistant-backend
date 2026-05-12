import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { runOpsReport } from "@/lib/ops/run-ops-report";
import { logAdminAction, readJsonBody, requireTypedConfirmation } from "@/lib/admin/danger-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await readJsonBody(req);
    const confirmation = requireTypedConfirmation(req, body, "RUN");
    if (confirmation) return confirmation;

    const type = body?.type === "daily" ? "daily_ops" : "weekly_ops";

    await logAdminAction({ actorId: user.id, action: "ops_report_started", target: type });
    const result = await runOpsReport(type);
    await logAdminAction({ actorId: user.id, action: "ops_report_finished", target: type, payload: result });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
