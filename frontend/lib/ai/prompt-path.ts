/**
 * Prompt path instrumentation: composed (prompt_layers) vs fallback_version (prompt_versions) vs fallback_hardcoded.
 * Used for structured logging and analytics; never logs or returns prompt text in events.
 */

import type { DeckContextForCompose } from "@/lib/prompts/composeSystemPrompt";

export type PromptPath = "composed" | "fallback_version" | "fallback_hardcoded";

export type PromptBuildResult = {
  systemPrompt: string;
  promptPath: PromptPath;
  promptVersionId?: string | null;
  formatKey?: string;
  modulesAttached?: string[];
  error?: { name?: string; message?: string } | null;
};

const ERROR_MESSAGE_MAX_LEN = 160;

function truncateError(err: unknown): { name?: string; message?: string } | null {
  if (err == null) return null;
  const name = err instanceof Error ? err.name : undefined;
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.length > ERROR_MESSAGE_MAX_LEN ? raw.slice(0, ERROR_MESSAGE_MAX_LEN) + "…" : raw;
  return { name, message };
}

export type BuildSystemPromptOpts = {
  kind: "chat" | "deck_analysis";
  formatKey: string;
  deckContextForCompose?: DeckContextForCompose | null;
  supabase?: any;
  hardcodedDefaultPrompt: string;
  extraSuffix?: string;
};

/**
 * Build system prompt for a request: try composed (prompt_layers), then fallback_version (prompt_versions), then hardcoded.
 * Never returns prompt text in analytics; only returns it to the caller.
 */
export async function buildSystemPromptForRequest(opts: BuildSystemPromptOpts): Promise<PromptBuildResult> {
  const { kind, formatKey, deckContextForCompose, supabase, hardcodedDefaultPrompt, extraSuffix = "" } = opts;

  try {
    const { composeSystemPrompt } = await import("@/lib/prompts/composeSystemPrompt");
    const { composed, modulesAttached } = await composeSystemPrompt({
      formatKey,
      deckContext: deckContextForCompose ?? undefined,
      supabase,
    });
    return {
      systemPrompt: composed + extraSuffix,
      promptPath: "composed",
      formatKey,
      modulesAttached: modulesAttached ?? [],
    };
  } catch (composeErr) {
    const composeErrorShort = truncateError(composeErr);
    try {
      const { getPromptVersion } = await import("@/lib/config/prompts");
      const version = await getPromptVersion(kind, supabase);
      if (version?.system_prompt) {
        return {
          systemPrompt: version.system_prompt + extraSuffix,
          promptPath: "fallback_version",
          promptVersionId: version.id,
          formatKey,
          error: composeErrorShort,
        };
      }
    } catch (_) {}
    return {
      systemPrompt: hardcodedDefaultPrompt + extraSuffix,
      promptPath: "fallback_hardcoded",
      error: composeErrorShort,
    };
  }
}

/** Generate a short request id for once-per-request logging (no PII). */
export function generatePromptRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}
