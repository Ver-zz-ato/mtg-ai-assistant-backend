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

/**
 * GET /api/admin/prompt-versions
 * List all prompt versions for a given kind
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") as "chat" | "deck_analysis" | null;

    if (!kind || !["chat", "deck_analysis"].includes(kind)) {
      return NextResponse.json({ ok: false, error: "kind must be 'chat' or 'deck_analysis'" }, { status: 400 });
    }

    // Get all versions for this kind
    const { data: versions, error: versionsError } = await supabase
      .from("prompt_versions")
      .select("*")
      .eq("kind", kind)
      .order("created_at", { ascending: false });

    if (versionsError) {
      return NextResponse.json({ ok: false, error: versionsError.message }, { status: 500 });
    }

    // Get active version from app_config
    const { data: activeConfig } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", `active_prompt_version_${kind}`)
      .maybeSingle();

    const activeVersionId = activeConfig?.value?.id || null;
    
    // Find active version in the list and get its prompt text
    let activePromptText = null;
    if (activeVersionId) {
      const activeVersion = versions?.find((v: any) => v.id === activeVersionId);
      if (activeVersion) {
        activePromptText = activeVersion.system_prompt;
      } else {
        // Active version not in list - load it directly
        const { data: versionData } = await supabase
          .from("prompt_versions")
          .select("system_prompt")
          .eq("id", activeVersionId)
          .eq("kind", kind)
          .maybeSingle();
        if (versionData) {
          activePromptText = versionData.system_prompt;
        }
      }
    }
    
    // Fallback to app_config if no active version
    if (!activePromptText) {
      const { data: promptsConfig } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "prompts")
        .maybeSingle();
      if (promptsConfig?.value?.templates?.system) {
        activePromptText = promptsConfig.value.templates.system;
      }
    }

    return NextResponse.json({
      ok: true,
      versions: versions || [],
      activeVersionId,
      activePromptText: activePromptText || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/prompt-versions
 * Set a prompt version as active
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { versionId, kind } = body;

    if (!versionId || !kind || !["chat", "deck_analysis"].includes(kind)) {
      return NextResponse.json(
        { ok: false, error: "versionId and kind (chat|deck_analysis) required" },
        { status: 400 }
      );
    }

    // Verify version exists
    const { data: version, error: versionError } = await supabase
      .from("prompt_versions")
      .select("id, version")
      .eq("id", versionId)
      .eq("kind", kind)
      .maybeSingle();

    if (versionError || !version) {
      return NextResponse.json({ ok: false, error: "Version not found" }, { status: 404 });
    }

    // Update app_config to set as active
    const { error: configError } = await supabase
      .from("app_config")
      .upsert(
        {
          key: `active_prompt_version_${kind}`,
          value: { id: versionId, version: version.version },
        },
        { onConflict: "key" }
      );

    if (configError) {
      return NextResponse.json({ ok: false, error: configError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: `Set ${version.version} as active for ${kind}`,
      activeVersionId: versionId,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}



