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
    const { kind = "chat", prompt_version_id } = body;

    const promptKind = kind === "deck_analysis" ? "deck_analysis" : "chat";

    // If prompt_version_id provided, use it. Otherwise get previous from history.
    let targetVersionId: string | null = prompt_version_id || null;

    if (!targetVersionId) {
      const { data: lastAdopt } = await supabase
        .from("ai_prompt_history")
        .select("previous_prompt_version_id")
        .eq("kind", promptKind)
        .eq("action", "adopt")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      targetVersionId = lastAdopt?.previous_prompt_version_id || null;
    }

    if (!targetVersionId) {
      return NextResponse.json({ ok: false, error: "No previous version to rollback to" }, { status: 400 });
    }

    const previousPrompt = await getPromptVersionById(targetVersionId, promptKind);
    if (!previousPrompt) {
      return NextResponse.json({ ok: false, error: "Previous prompt version not found" }, { status: 404 });
    }

    const currentPrompt = await getPromptVersion(promptKind);

    // Log rollback to history
    await supabase.from("ai_prompt_history").insert({
      kind: promptKind,
      action: "rollback",
      prompt_version_id: previousPrompt.id,
      previous_prompt_version_id: currentPrompt?.id || null,
      reason: "Rollback to previous version",
      meta: { rolled_back_by: "rollback-prompt-api" },
    });

    // Set previous as active
    await admin
      .from("app_config")
      .upsert(
        {
          key: `active_prompt_version_${promptKind}`,
          value: { id: previousPrompt.id, version: previousPrompt.version },
        },
        { onConflict: "key" }
      );

    return NextResponse.json({
      ok: true,
      message: `Rolled back to ${previousPrompt.version}`,
      previous_version: currentPrompt?.version,
      restored_version: previousPrompt.version,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
