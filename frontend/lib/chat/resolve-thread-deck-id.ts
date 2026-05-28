/**
 * Resolve deck_id for a chat request. The thread row is authoritative when set;
 * client context.deckId may only fill in when the thread has no linked deck.
 */
export type ResolveThreadDeckIdResult = {
  deckId: string | null;
  /** Client sent context.deckId that was ignored because it conflicted with the thread. */
  rejectedContextDeckId: boolean;
};

export function resolveThreadDeckId(
  threadDeckId: string | null | undefined,
  contextDeckId: string | null | undefined
): ResolveThreadDeckIdResult {
  const thread = typeof threadDeckId === "string" && threadDeckId.trim() ? threadDeckId.trim() : null;
  const context = typeof contextDeckId === "string" && contextDeckId.trim() ? contextDeckId.trim() : null;

  if (thread) {
    if (context && context !== thread) {
      return { deckId: thread, rejectedContextDeckId: true };
    }
    return { deckId: thread, rejectedContextDeckId: false };
  }

  if (context) {
    return { deckId: context, rejectedContextDeckId: false };
  }

  return { deckId: null, rejectedContextDeckId: false };
}
