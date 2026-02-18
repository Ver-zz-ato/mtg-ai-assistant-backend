import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion, getPromptVersionById } from "@/lib/config/prompts";
import { getAdmin } from "@/app/api/_lib/supa";

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

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client required" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { approved_prompt_version_id, notes } = body;

    if (!approved_prompt_version_id) {
      return NextResponse.json({ ok: false, error: "approved_prompt_version_id required" }, { status: 400 });
    }

    const { data: proposal, error: propErr } = await supabase
      .from("ai_prompt_change_proposals")
      .select("*")
      .eq("id", id)
      .eq("status", "pending")
      .single();

    if (propErr || !proposal) {
      return NextResponse.json({ ok: false, error: "Proposal not found or not pending" }, { status: 404 });
    }

    const kind = proposal.kind || "chat";
    const promptKind = kind === "deck_analysis" ? "deck_analysis" : "chat";
    const newPrompt = await getPromptVersionById(approved_prompt_version_id, promptKind);
    if (!newPrompt) {
      return NextResponse.json({ ok: false, error: "Approved prompt version not found" }, { status: 404 });
    }

    const currentPrompt = await getPromptVersion(promptKind);
    const previousId = currentPrompt?.id || null;

    // Set new prompt as active
    await admin
      .from("app_config")
      .upsert(
        {
          key: `active_prompt_version_${promptKind}`,
          value: { id: newPrompt.id, version: newPrompt.version },
        },
        { onConflict: "key" }
      );

    // Mark prior active as previous (update status in prompt_versions if we have that column)
    if (previousId) {
      await admin.from("prompt_versions").update({ status: "previous" }).eq("id", previousId);
    }
    await admin.from("prompt_versions").update({ status: "active" }).eq("id", newPrompt.id);

    // Update proposal
    await supabase
      .from("ai_prompt_change_proposals")
      .update({
        status: "approved",
        approved_prompt_version_id: newPrompt.id,
        approval_notes: notes || null,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Log to prompt history
    await supabase.from("ai_prompt_history").insert({
      kind: promptKind,
      action: "adopt",
      prompt_version_id: newPrompt.id,
      previous_prompt_version_id: previousId,
      reason: `Proposal ${id} approved`,
      test_evidence: proposal.evidence || {},
      meta: { proposal_id: id },
    });

    return NextResponse.json({
      ok: true,
      message: `Adopted ${newPrompt.version} as active`,
      approved_prompt_version_id: newPrompt.id,
      previous_version: currentPrompt?.version,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
