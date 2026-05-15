/**
 * Analytics enrichment helper for chat events
 * 
 * Adds shared metadata to chat analytics events and normalizes values.
 * Keeps only non-sensitive presence flags for thread/message text.
 */

export interface ChatEventContext {
  threadId?: string | null;
  personaId?: string | null;
  promptVersion?: string | null;
  format?: string | null;
  commander?: string | null;
  userMessage?: string | null;
  assistantMessage?: string | null;
  messageId?: string | null;
}

/**
 * Enrich a chat analytics event with shared metadata
 * 
 * @param base - Base event properties
 * @param ctx - Context with available metadata
 * @returns Enriched event properties with undefined values removed
 */
export function enrichChatEvent(
  base: Record<string, any>,
  ctx: ChatEventContext
): Record<string, any> {
  const out: Record<string, any> = {
    ...base,
  };

  // Add metadata from context (prefer context over base)
  out.thread_id_present = Boolean(ctx.threadId ?? base.thread_id ?? base.threadId);

  if (ctx.personaId !== undefined) {
    out.persona = ctx.personaId ?? null;
  } else if (base.persona === undefined) {
    out.persona = null;
  }

  if (ctx.promptVersion !== undefined) {
    out.prompt_version = ctx.promptVersion ?? null;
  } else if (base.prompt_version === undefined) {
    out.prompt_version = null;
  }

  if (ctx.format !== undefined) {
    out.format = ctx.format ?? null;
  } else if (base.format === undefined) {
    out.format = null;
  }

  if (ctx.commander !== undefined) {
    out.commander_name = ctx.commander ?? null;
  } else if (base.commander_name === undefined) {
    out.commander_name = null;
  }

  if (ctx.messageId !== undefined) {
    out.message_id = ctx.messageId ?? null;
  } else if (base.message_id === undefined) {
    out.message_id = null;
  }

  out.user_message_present = Boolean(ctx.userMessage ?? base.user_message ?? base.userMessage);
  out.assistant_message_present = Boolean(ctx.assistantMessage ?? base.assistant_message ?? base.assistantMessage);

  // Normalize: remove undefined, keep null
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) {
      out[k] = null;
    }
  }

  return out;
}

