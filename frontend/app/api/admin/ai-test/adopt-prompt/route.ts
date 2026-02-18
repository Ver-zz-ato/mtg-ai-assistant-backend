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

export async function POST(req: NextRequest) {
  try {
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
    const { prompt_version_id, kind = "chat", reason, test_evidence } = body;

    if (!prompt_version_id) {
      return NextResponse.json({ ok: false, error: "prompt_version_id required" }, { status: 400 });
    }

    const promptKind = kind === "deck_analysis" ? "deck_analysis" : "chat";
    const currentPrompt = await getPromptVersion(promptKind);
    const newPrompt = await getPromptVersionById(prompt_version_id, promptKind);

    if (!newPrompt) {
      return NextResponse.json({ ok: false, error: "Prompt version not found" }, { status: 404 });
    }

    const previousId = currentPrompt?.id || null;
    const previousVersion = currentPrompt?.version || "unknown";

    // Log to ai_prompt_history before switching
    await supabase.from("ai_prompt_history").insert({
      kind: promptKind,
      action: "adopt",
      prompt_version_id: newPrompt.id,
      previous_prompt_version_id: previousId,
      reason: reason || "Auto-improve adoption",
      test_evidence: test_evidence || {},
      meta: { adopted_by: "adopt-prompt-api" },
    });

    // Create ELI5 improvement report
    const ev = test_evidence || {};
    await supabase.from("ai_improvement_reports").insert({
      kind: promptKind,
      what_changed: "Prompt updated via auto-improve adoption",
      why: reason || "Evidence-backed improvement",
      what_improved: ev.win_rate_delta != null ? `Win rate: +${ev.win_rate_delta}%` : "Adopted recommended variant",
      risk: "Review production behavior after adoption. Rollback available.",
      meta: ev,
      prompt_version_before: previousVersion,
      prompt_version_after: newPrompt.version,
    });

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

    return NextResponse.json({
      ok: true,
      message: `Adopted ${newPrompt.version} as active for ${promptKind}`,
      previous_version: previousVersion,
      new_version: newPrompt.version,
      rollback_available: !!previousId,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
