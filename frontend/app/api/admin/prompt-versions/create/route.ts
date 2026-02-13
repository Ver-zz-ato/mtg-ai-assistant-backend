import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
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

/**
 * POST /api/admin/prompt-versions/create
 * Create a new prompt version from pasted text and set it as active
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { promptText, kind, description } = body;

    if (!promptText || typeof promptText !== "string" || promptText.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "promptText is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!kind || !["chat", "deck_analysis"].includes(kind)) {
      return NextResponse.json(
        { ok: false, error: "kind must be 'chat' or 'deck_analysis'" },
        { status: 400 }
      );
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    // Get current prompt version for reference
    const { getPromptVersion } = await import("@/lib/config/prompts");
    const currentPrompt = await getPromptVersion(kind as "chat" | "deck_analysis");

    // Create new prompt version
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const newVersion = `v${timestamp}`;

    const { data: newPromptVersion, error: versionError } = await admin
      .from("prompt_versions")
      .insert({
        version: newVersion,
        kind: kind,
        system_prompt: promptText.trim(),
        meta: {
          source: "manual-replacement",
          description: description || "Manually pasted prompt replacement",
          previous_version: currentPrompt?.version || "unknown",
          created_by: user.email || user.id,
        },
      })
      .select("id, version")
      .single();

    if (versionError || !newPromptVersion) {
      return NextResponse.json({
        ok: false,
        error: `Failed to create prompt version: ${versionError?.message || "unknown"}`,
      }, { status: 500 });
    }

    // Set the new version as active
    const { error: activeError } = await admin
      .from("app_config")
      .upsert(
        {
          key: `active_prompt_version_${kind}`,
          value: { id: newPromptVersion.id, version: newPromptVersion.version },
        },
        { onConflict: "key" }
      );

    if (activeError) {
      console.error("[create-prompt-version] ❌ Failed to set active version:", activeError);
      // Continue anyway - the version was created
    } else {
      console.log(`[create-prompt-version] ✅ Set ${newPromptVersion.version} (${newPromptVersion.id}) as active for ${kind}`);
    }

    // Update app_config for backward compatibility
    const { data: promptsConfig } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "prompts")
      .maybeSingle();

    const currentPrompts = promptsConfig?.value || {
      version: "v1",
      templates: { system: "", user: "" },
      ab: { a: true, b: false },
    };

    const updatedPrompts = {
      ...currentPrompts,
      version: newVersion,
      templates: {
        ...currentPrompts.templates,
        system: promptText.trim(),
      },
    };

    await supabase
      .from("app_config")
      .upsert({
        key: "prompts",
        value: updatedPrompts,
      }, { onConflict: "key" });

    return NextResponse.json({
      ok: true,
      message: `Created new prompt version and set as active for ${kind}`,
      newVersion: newPromptVersion.version,
      promptVersionId: newPromptVersion.id,
      previousVersion: currentPrompt?.version || "unknown",
      promptLength: promptText.trim().length,
      isActive: true,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "server_error" }, { status: 500 });
  }
}

