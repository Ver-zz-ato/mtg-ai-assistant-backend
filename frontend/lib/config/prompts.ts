/**
 * Prompt versioning helper functions
 * Loads system prompts from prompt_versions table with fallback to app_config
 */

import { getServerSupabase } from "@/lib/server-supabase";

export type PromptVersion = {
  id: string;
  version: string;
  system_prompt: string;
};

/**
 * Get the active prompt version for a given kind
 * Falls back to app_config for backward compatibility
 */
export async function getPromptVersion(
  kind: "chat" | "deck_analysis",
  supabase?: any
): Promise<PromptVersion | null> {
  try {
    const db = supabase || await getServerSupabase();

    // First, check app_config for active version
    const { data: activeConfig } = await db
      .from("app_config")
      .select("value")
      .eq("key", `active_prompt_version_${kind}`)
      .maybeSingle();

    const activeVersionId = activeConfig?.value?.id;

    if (activeVersionId) {
      // Load the active version from prompt_versions
      const { data: versionData, error: versionError } = await db
        .from("prompt_versions")
        .select("id, version, system_prompt")
        .eq("id", activeVersionId)
        .eq("kind", kind)
        .maybeSingle();

      if (!versionError && versionData) {
        console.log(`[getPromptVersion] ✅ Loaded active version ${versionData.version} (${versionData.id}) for ${kind}`);
        return {
          id: versionData.id,
          version: versionData.version,
          system_prompt: versionData.system_prompt,
        };
      } else if (versionError) {
        console.warn(`[getPromptVersion] ⚠️ Error loading active version ${activeVersionId}:`, versionError);
      }
    } else {
      console.log(`[getPromptVersion] ⚠️ No active version set for ${kind}, checking fallbacks...`);
    }

    // Fallback: get latest version for this kind
    const { data: versionData, error: versionError } = await db
      .from("prompt_versions")
      .select("id, version, system_prompt")
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!versionError && versionData) {
      return {
        id: versionData.id,
        version: versionData.version,
        system_prompt: versionData.system_prompt,
      };
    }

    // Fallback to app_config (legacy system)
    const { data: promptsConfig } = await db
      .from("app_config")
      .select("value")
      .eq("key", "prompts")
      .maybeSingle();

    if (promptsConfig?.value?.templates?.system) {
      const systemPrompt = promptsConfig.value.templates.system;
      const version = promptsConfig.value.version || "legacy";

      // Return a temporary ID for legacy prompts
      return {
        id: `legacy-${kind}-${version}`,
        version,
        system_prompt: systemPrompt,
      };
    }

    return null;
  } catch (error) {
    console.warn(`[getPromptVersion] Failed to load prompt for ${kind}:`, error);
    return null;
  }
}

/**
 * Get active prompt version (for backward compatibility with existing code)
 */
export function getActivePromptVersion(): string {
  // This is a stub - the actual version is loaded asynchronously
  // Kept for compatibility with existing code that calls this
  return "v1";
}
