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

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { notes, reason_code } = body;

    const { data: proposal, error: propErr } = await supabase
      .from("ai_prompt_change_proposals")
      .select("id, status")
      .eq("id", id)
      .eq("status", "pending")
      .single();

    if (propErr || !proposal) {
      return NextResponse.json({ ok: false, error: "Proposal not found or not pending" }, { status: 404 });
    }

    await supabase
      .from("ai_prompt_change_proposals")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        approval_notes: [notes, reason_code].filter(Boolean).join(" | ") || null,
      })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      message: "Proposal rejected",
      proposal_id: id,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
