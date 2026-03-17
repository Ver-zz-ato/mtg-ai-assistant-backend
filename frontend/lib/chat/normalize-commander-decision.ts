/**
 * Normalize commander decision state so impossible combinations cannot slip through.
 * Single place that enforces invariants before prompt assembly and debug emission.
 */

import type { ActiveDeckContext } from "./active-deck-context";
import type { DeckSource } from "./active-deck-context";

export type InjectedMode = "analyze" | "confirm" | "ask_commander" | "none";

export type ConfirmationSource = "explicit_user_reply" | "linked_deck" | "inferred_only" | "none";

export type NormalizedCommanderState = {
  streamInjected: InjectedMode;
  streamDecisionReason: string | null;
  commanderStatus: "missing" | "inferred" | "confirmed" | "corrected";
  commander_confirmed: boolean;
  commander_confirm_required: boolean;
  analyze_now_expected: boolean;
  extra_clarification_allowed: boolean;
  confirmation_source: ConfirmationSource;
  trusted_commander_for_analysis: boolean;
  normalization_applied: boolean;
  state_was_contradictory_before_normalization: boolean;
  prompt_mode: InjectedMode;
};

export type NormalizeCommanderDecisionStateArgs = {
  streamInjected: InjectedMode;
  streamDecisionReason: string | null;
  activeDeckContext: ActiveDeckContext;
  hasFullDeckContext: boolean;
};

/**
 * Enforce hard invariants:
 * - analyze turn with paste/thread must have commander_confirmed true (or linked trusted).
 * - analyze_now_expected and extra_clarification_allowed must not both be true.
 * - decision_reason must match actual trusted state.
 */
export function normalizeCommanderDecisionState(
  args: NormalizeCommanderDecisionStateArgs
): NormalizedCommanderState {
  const { streamInjected, streamDecisionReason, activeDeckContext, hasFullDeckContext } = args;
  const source = activeDeckContext.source as DeckSource;
  const hasDeck = activeDeckContext.hasDeck;
  const rawStatus = activeDeckContext.commanderStatus;
  const linkedTrusted = source === "linked" && !!activeDeckContext.commanderName;
  const pasteOrThread =
    source === "current_paste" || source === "guest_ephemeral" || source === "thread_slot";

  const explicitlyConfirmed =
    rawStatus === "confirmed" ||
    rawStatus === "corrected" ||
    activeDeckContext.userJustConfirmedCommander ||
    activeDeckContext.userJustCorrectedCommander;

  let confirmation_source: ConfirmationSource = "none";
  if (linkedTrusted) confirmation_source = "linked_deck";
  else if (explicitlyConfirmed) confirmation_source = "explicit_user_reply";
  else if (rawStatus === "inferred" && hasDeck) confirmation_source = "inferred_only";

  const trusted_commander_for_analysis =
    hasDeck && hasFullDeckContext && (linkedTrusted || explicitlyConfirmed);

  // Detect contradictory state before normalization
  const invalidAnalyzeWithUnconfirmed =
    streamInjected === "analyze" && !linkedTrusted && !explicitlyConfirmed;
  const invalidReasonMismatch =
    streamDecisionReason === "commander_confirmed_or_linked" &&
    !linkedTrusted &&
    rawStatus === "inferred";
  const state_was_contradictory_before_normalization =
    invalidAnalyzeWithUnconfirmed || invalidReasonMismatch;

  let effectiveInjected = streamInjected;
  let effectiveStatus = rawStatus;
  let effectiveReason = streamDecisionReason;

  // RULE B / INVARIANT: analyze turn from paste/thread must have commander confirmed
  if (streamInjected === "analyze" && pasteOrThread && !explicitlyConfirmed && !linkedTrusted) {
    // Downgrade to confirm so we don't run analysis with inferred-only
    effectiveInjected = activeDeckContext.askReason === "need_commander" ? "ask_commander" : "confirm";
    effectiveReason =
      activeDeckContext.askReason === "need_commander" ? "commander_unknown_ask" : "paste_inferred_ask_confirm";
    effectiveStatus = rawStatus;
  }

  // When we have explicit confirmation or linked trusted, ensure status is confirmed for analyze
  if (
    effectiveInjected === "analyze" &&
    (explicitlyConfirmed || linkedTrusted) &&
    (effectiveStatus === "inferred" || effectiveStatus === "missing")
  ) {
    effectiveStatus = activeDeckContext.userJustCorrectedCommander ? "corrected" : "confirmed";
  }

  const commander_confirmed =
    effectiveStatus === "confirmed" || effectiveStatus === "corrected";
  const commander_confirm_required =
    effectiveInjected === "confirm" || effectiveInjected === "ask_commander" ||
    (effectiveInjected === "none" && (activeDeckContext.askReason === "confirm_inference" || activeDeckContext.askReason === "need_commander"));

  const analyze_now_expected =
    effectiveInjected === "analyze" &&
    hasFullDeckContext &&
    (commander_confirmed || linkedTrusted);

  const extra_clarification_allowed = !analyze_now_expected;

  const normalization_applied =
    state_was_contradictory_before_normalization ||
    effectiveInjected !== streamInjected ||
    effectiveStatus !== rawStatus;

  return {
    streamInjected: effectiveInjected,
    streamDecisionReason: effectiveReason,
    commanderStatus: effectiveStatus,
    commander_confirmed,
    commander_confirm_required,
    analyze_now_expected,
    extra_clarification_allowed,
    confirmation_source,
    trusted_commander_for_analysis,
    normalization_applied,
    state_was_contradictory_before_normalization,
    prompt_mode: effectiveInjected,
  };
}
