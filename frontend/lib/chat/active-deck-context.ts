/**
 * ActiveDeckContext — canonical authority for deck/commander resolution.
 *
 * Single source of truth for deck state; all downstream logic consumes this.
 *
 * Commander status semantics (document in helpers):
 * - inferred = TENTATIVE (may be wrong); do NOT treat as guaranteed truth
 * - confirmed | corrected = AUTHORITATIVE (user-validated)
 */

import { isDecklist, extractCommanderFromDecklistText, inferCommander } from "./decklistDetector";
import { normalizeDecklistText, hashDecklist } from "./decklist-normalize";

/** Commander status. inferred = tentative; confirmed/corrected = authoritative. */
export type CommanderStatus = "missing" | "inferred" | "confirmed" | "corrected";

/** Resolver-only deck source (detailed). */
export type DeckSource =
  | "none"
  | "linked"
  | "current_paste"
  | "thread_slot"
  | "history_fallback"
  | "guest_ephemeral";

/** Explicit reason for asking user. */
export type AskReason = "need_deck" | "need_commander" | "confirm_inference" | null;

export type CommanderCandidate = { name: string; confidence: number };

export type ActiveDeckContext = {
  hasDeck: boolean;
  source: DeckSource;
  deckId: string | null;
  commanderName: string | null;
  commanderStatus: CommanderStatus;
  commanderCandidates: CommanderCandidate[];
  decklistText: string | null;
  decklistHash: string;
  isFullDecklist: boolean;
  shouldAskCommanderConfirmation: boolean;
  shouldAskForDeck: boolean;
  askReason: AskReason;
  inferredCommanderFromCurrentTurn: string | null;
  userJustConfirmedCommander: boolean;
  userJustCorrectedCommander: boolean;
  linkedDeckTakesPriority: boolean;
  parseWarnings: string[];
  /** True when resolved deck hash differs from stored (new deck replacement; persistence should clear commander unless preserved). */
  deckReplacedByHashChange: boolean;
  debug: {
    resolutionPath: string[];
    deckSourceDetail?: string;
  };
};

/** True when commander is authoritative (user-validated). Use for prompt rules. */
export function isAuthoritativeCommander(ctx: ActiveDeckContext): boolean {
  return ctx.commanderStatus === "confirmed" || ctx.commanderStatus === "corrected";
}

/**
 * True when commander should be treated as authoritative for this request.
 * Includes just-confirmed / just-corrected (same turn) so we inject CRITICAL and persist immediately.
 * Do not require commanderStatus === confirmed before persistence.
 */
export function isAuthoritativeForPrompt(ctx: ActiveDeckContext): boolean {
  return (
    isAuthoritativeCommander(ctx) ||
    ctx.userJustConfirmedCommander ||
    ctx.userJustCorrectedCommander
  );
}

export type ResolveActiveDeckContextArgs = {
  tid: string | null;
  isGuest: boolean;
  userId: string | null;
  text: string | null;
  context: { deckId?: string | null } | null;
  prefs: Record<string, unknown> | null;
  thread: { deck_id?: string | null; commander?: string | null; decklist_text?: string | null; decklist_hash?: string | null } | null;
  streamThreadHistory: Array<{ role: string; content?: string }>;
  clientConversation: Array<{ role: string; content?: string }>;
  /** When true, standalone rules/legality question — do not set need_deck even when no deck. */
  isStandaloneRulesQuestion?: boolean;
  deckData: {
    d: { commander?: string | null; title?: string; format?: string };
    entries: Array<{ name: string; count?: number }>;
    deckText: string;
  } | null;
};

function detectExplicitOverride(text: string | null): boolean {
  if (!text?.trim()) return false;
  const t = text.trim().toLowerCase();
  if (/use\s+this\s+(instead|version)/i.test(t)) return true;
  if (/ignore\s+(the\s+)?linked\s+deck/i.test(t)) return true;
  if (/for\s+(another|a\s+different)\s+deck/i.test(t)) return true;
  return false;
}

function looksLikeConfirmation(t: string): boolean {
  const q = (t || "").trim().toLowerCase().replace(/[!.,;:]+$/, "").trim();
  if (!q) return false;
  if (/^(yes|yep|yeah|correct|that's right|right|confirmed?|sure|ok|okay)$/i.test(q)) return true;
  if (/^(yes|yep|yeah|correct),?\s+.+$/i.test(q) && q.length <= 60) return true;
  if (/^no,?\s*(it'?s?|my commander is)\s+/i.test(q) || /^no\s+it'?s\s+/i.test(q)) return true;
  if (/^actually\s+(it'?s?|my commander is)\s+/i.test(q)) return true;
  if (/^(no|nope|wrong)\b/i.test(q) && q.length < 80) return true;
  if (q.length <= 15 && /^(yes|yep|yeah|correct|right|ok|okay|sure)/i.test(q)) return true;
  return false;
}

function extractCorrection(raw: string): string | null {
  const bracketMatch = raw.match(/(?:no,?\s*(?:it'?s?|my commander is)|actually\s+(?:it'?s?|my commander is)|no\s+it'?s)\s*[:\s]*\[\[([^\]]+)\]\]/i);
  if (bracketMatch) return bracketMatch[1]?.trim() ?? null;
  const quotedMatch = raw.match(/(?:no,?\s*(?:it'?s?|my commander is)|actually\s+(?:it'?s?|my commander is)|no\s+it'?s)\s*[:\s]*["']([^"']+)["']/i);
  if (quotedMatch) return quotedMatch[1]?.trim() ?? null;
  const plainMatch = raw.match(/(?:no,?\s*(?:it'?s?|my commander is)|actually\s+(?:it'?s?|my commander is)|no\s+it'?s)\s*[:\s]+([\s\S]+?)(?:\s*[.?!]|$)/i);
  if (plainMatch) return plainMatch[1]?.trim()?.replace(/^["'\[\]]+|["'\[\]]+$/g, "") ?? null;
  if (/^(no|nope|wrong)/i.test(raw)) {
    const fallback = raw.replace(/^(no|nope|wrong),?\s*/i, "").replace(/^(it'?s?|my commander is)\s*/i, "").trim();
    if (fallback.length > 2 && fallback.length < 80) return fallback.replace(/^["'\[\]]+|["'\[\]]+$/g, "");
  }
  return null;
}

/**
 * Resolve deck and commander state for the current request.
 * Deck precedence: linked > current_paste (only on explicit override when linked) > thread_slot > guest_ephemeral > history_fallback > none.
 * Commander precedence: confirmed/corrected thread > linked deck metadata > parsed from paste > thread slot > history fallback > none.
 */
export function resolveActiveDeckContext(args: ResolveActiveDeckContextArgs): ActiveDeckContext {
  const {
    tid,
    isGuest,
    text,
    context,
    thread,
    streamThreadHistory,
    clientConversation,
    isStandaloneRulesQuestion,
    deckData,
  } = args;

  const path: string[] = [];
  const parseWarnings: string[] = [];

  const deckIdLinked =
    (context?.deckId ?? thread?.deck_id ?? null) as string | null;
  const threadCommander = (thread?.commander as string) ?? null;
  const threadDecklistText = (thread?.decklist_text as string) ?? null;
  const threadDecklistHashStored = (thread?.decklist_hash as string) ?? null;

  const explicitOverride = detectExplicitOverride(text ?? null);
  const currentIsDecklist = isDecklist(text ?? "");
  const historyForConfirm = streamThreadHistory?.length ? streamThreadHistory : clientConversation;
  const lastAssistant = historyForConfirm
    ?.filter((m) => m.role === "assistant")
    .pop();
  const lastAssistantContent = (lastAssistant as { content?: string })?.content ?? "";
  // Broad: assistant asked about commander (exact phrase or any "commander" + confirm-style question)
  const askedCommanderExact = /I believe your commander is|is this correct\?/i.test(lastAssistantContent);
  const askedCommanderBroad = lastAssistantContent.length > 0 && /commander/i.test(lastAssistantContent) && (/is this correct|confirm|correct\?|your commander/i.test(lastAssistantContent));
  const askedCommander = askedCommanderExact || askedCommanderBroad;
  const userRespondedToConfirm = askedCommander && looksLikeConfirmation(text ?? "");
  const commanderCorrection = userRespondedToConfirm ? extractCorrection((text ?? "").trim()) : null;
  const isCorrection = !!(commanderCorrection && commanderCorrection.trim());

  let source: DeckSource = "none";
  let deckId: string | null = null;
  let decklistText: string | null = null;
  let decklistHash = "";
  let commanderName: string | null = null;
  let commanderStatus: CommanderStatus = "missing";
  let commanderCandidates: CommanderCandidate[] = [];
  let linkedDeckTakesPriority = false;

  // Deck resolution
  if (deckData?.deckText?.trim() && deckIdLinked && !explicitOverride) {
    source = "linked";
    deckId = deckIdLinked;
    decklistText = deckData.deckText;
    decklistHash = hashDecklist(normalizeDecklistText(decklistText));
    linkedDeckTakesPriority = true;
    path.push("linked");
  }

  if (!decklistText && currentIsDecklist && (explicitOverride || !deckIdLinked)) {
    source = isGuest ? "guest_ephemeral" : "current_paste";
    decklistText = text ?? null;
    if (decklistText) {
      decklistHash = hashDecklist(normalizeDecklistText(decklistText));
      path.push("current_paste");
    }
  }

  if (!decklistText && threadDecklistText?.trim()) {
    source = "thread_slot";
    decklistText = threadDecklistText;
    decklistHash = hashDecklist(normalizeDecklistText(decklistText));
    path.push("thread_slot");
  }

  if (!decklistText && isGuest && clientConversation?.length) {
    for (let i = clientConversation.length - 1; i >= 0; i--) {
      const msg = clientConversation[i];
      if (msg.role === "user" && msg.content && isDecklist(msg.content)) {
        decklistText = msg.content;
        decklistHash = hashDecklist(normalizeDecklistText(decklistText));
        source = "guest_ephemeral";
        path.push("guest_ephemeral");
        break;
      }
    }
  }

  if (!decklistText && tid && streamThreadHistory?.length) {
    for (let i = streamThreadHistory.length - 1; i >= 0; i--) {
      const msg = streamThreadHistory[i];
      if (msg.role === "user" && msg.content && isDecklist(msg.content)) {
        decklistText = msg.content;
        decklistHash = hashDecklist(normalizeDecklistText(decklistText));
        source = "history_fallback";
        path.push("history_fallback");
        break;
      }
    }
  }

  if (!path.length) path.push("none");

  // Contradiction/context-switch: new deck pasted with different hash = replacement
  const deckReplacedByHashChange =
    source === "current_paste" &&
    !!decklistHash &&
    !!threadDecklistHashStored &&
    decklistHash !== threadDecklistHashStored;

  const hasDeck = !!(decklistText && decklistText.trim().length >= 20);
  const isFullDecklist = !!(decklistText && decklistText.split(/\r?\n/).filter((l) => l.trim()).length >= 90);

  // Commander resolution
  // When deck was replaced by hash change, thread commander is stale — do not use it.
  const threadCommanderValid = threadCommander && hasDeck && !deckReplacedByHashChange;
  if (threadCommanderValid) {
    commanderName = isCorrection ? commanderCorrection! : threadCommander;
    commanderStatus = isCorrection ? "corrected" : "confirmed";
    path.push("commander:thread");
  } else if (deckData?.d?.commander && source === "linked") {
    commanderName = deckData.d.commander;
    commanderStatus = "confirmed";
    path.push("commander:linked");
  } else if (decklistText) {
    const inference = inferCommander(decklistText, text ?? undefined, deckData?.d?.commander ?? null);
    if (inference) {
      commanderName = isCorrection ? commanderCorrection! : inference.commanderName;
      commanderStatus = isCorrection ? "corrected" : "inferred";
      commanderCandidates = inference.candidates;
      path.push("commander:parsed");
    } else {
      path.push("commander:none");
    }
  }

  const inferredCommanderFromCurrentTurn =
    currentIsDecklist && decklistText
      ? inferCommander(decklistText, text ?? undefined, null)?.commanderName ?? null
      : null;

  // Treat "X is the commander" (or "X is my commander") in current message as explicit confirmation so we don't ask again or contradict with "system info"
  const explicitDeclarationMatch = (text ?? "").match(/^(.+?)\s+is\s+(?:my\s+)?(?:the\s+)?commander\s*\.?$/im);
  const declaredCommander = explicitDeclarationMatch ? explicitDeclarationMatch[1].trim() : null;
  const userDeclaredCommanderThisTurn =
    declaredCommander &&
    commanderName &&
    declaredCommander.length >= 2 &&
    declaredCommander.length <= 80 &&
    declaredCommander.toLowerCase() === commanderName.toLowerCase();

  const userJustConfirmedCommander =
    (userRespondedToConfirm && !isCorrection) || !!userDeclaredCommanderThisTurn;
  const userJustCorrectedCommander = userRespondedToConfirm && isCorrection;

  // Once user explicitly confirms or corrects, promote status so downstream never sees "inferred" for this turn
  const effectiveCommanderStatus: CommanderStatus =
    userJustCorrectedCommander ? "corrected" : userJustConfirmedCommander ? "confirmed" : commanderStatus;

  let shouldAskCommanderConfirmation = false;
  let shouldAskForDeck = false;
  let askReason: AskReason = null;

  if (!hasDeck) {
    if (!isStandaloneRulesQuestion) {
      shouldAskForDeck = true;
      askReason = "need_deck";
    }
  } else if (effectiveCommanderStatus === "missing") {
    shouldAskCommanderConfirmation = false;
    shouldAskForDeck = false;
    askReason = "need_commander";
  } else if (effectiveCommanderStatus === "inferred" && !userRespondedToConfirm) {
    shouldAskCommanderConfirmation = true;
    askReason = "confirm_inference";
  }

  return {
    hasDeck,
    source,
    deckId,
    commanderName,
    commanderStatus: effectiveCommanderStatus,
    commanderCandidates,
    decklistText,
    decklistHash,
    isFullDecklist,
    shouldAskCommanderConfirmation,
    shouldAskForDeck,
    askReason,
    inferredCommanderFromCurrentTurn,
    userJustConfirmedCommander,
    userJustCorrectedCommander,
    linkedDeckTakesPriority,
    parseWarnings,
    deckReplacedByHashChange,
    debug: { resolutionPath: path },
  };
}
