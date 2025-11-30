/**
 * Analytics enrichment helper for chat events
 * 
 * Adds shared metadata to chat analytics events and normalizes values.
 * Truncates message content to prevent PII issues and keep events lightweight.
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
  if (ctx.threadId !== undefined) {
    out.thread_id = ctx.threadId ?? null;
  } else if (base.thread_id === undefined) {
    out.thread_id = null;
  }

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

  // Truncate messages to 200 chars
  if (ctx.userMessage) {
    out.user_message = ctx.userMessage.slice(0, 200);
  } else if (base.user_message === undefined) {
    out.user_message = null;
  }

  if (ctx.assistantMessage) {
    out.assistant_message = ctx.assistantMessage.slice(0, 200);
  } else if (base.assistant_message === undefined) {
    out.assistant_message = null;
  }

  // Normalize: remove undefined, keep null
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) {
      out[k] = null;
    }
  }

  return out;
}

