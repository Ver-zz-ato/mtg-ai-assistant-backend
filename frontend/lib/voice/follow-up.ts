import type { GameAction, VoiceContext, VoiceTargetMatchQuality } from "./types";
import { detectPlayerMention, normalizeVoiceName, type VoicePlayerRef } from "./player-match";
import { validateActions } from "./validate";

const YES_PATTERN = /^(yes|yeah|yep|correct|that's right|that one|do it|confirm)$/;
const NO_PATTERN = /^(no|nope|cancel|never mind|stop)$/;
const UNDO_PATTERN = /^(undo|undo that|revert that|take that back)$/;
const AND_MORE_PATTERN = /^(?:and\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+more$/;
const SAME_FOR_PLAYER_PATTERN = /^same\s+for\s+(.+)$/;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export interface PendingClarificationResolution {
  outcome: "apply" | "cancel" | "clarify";
  actions?: GameAction[];
  clarification?: string;
  resolution?: "confirmed" | "corrected" | "cancelled";
  matchQuality?: VoiceTargetMatchQuality;
}

export interface FollowUpResolution {
  actions: GameAction[];
  spokenConfirmation?: string;
  matchQuality: VoiceTargetMatchQuality;
}

function parseNumber(raw: string): number | null {
  const normalized = normalizeVoiceName(raw);
  if (!normalized) return null;
  if (NUMBER_WORDS[normalized] != null) return NUMBER_WORDS[normalized] ?? null;
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
}

function cloneActions(actions: GameAction[]): GameAction[] {
  return actions.map((action) => ({ ...action }));
}

function firstTargetPlayerId(actions: GameAction[]): string | null {
  for (const action of actions) {
    if ("target" in action && typeof action.target === "string") return action.target;
  }
  return null;
}

function firstSourcePlayerId(actions: GameAction[]): string | null {
  for (const action of actions) {
    if ("source" in action && typeof action.source === "string") return action.source;
  }
  return null;
}

function resolveMention(
  transcript: string,
  players: VoicePlayerRef[] | undefined,
  selfPlayerId?: string,
): { playerId: string | null; quality: VoiceTargetMatchQuality } {
  if (!players?.length) return { playerId: null, quality: "unresolved" };
  const mention = detectPlayerMention(transcript, players, selfPlayerId);
  if (!mention.target || mention.ambiguous) return { playerId: null, quality: "unresolved" };
  const normalized = normalizeVoiceName(transcript);
  const player = players.find((entry) => entry.id === mention.target);
  if (!player) return { playerId: null, quality: "unresolved" };
  const exactName = normalizeVoiceName(player.name);
  if (normalized.includes(exactName)) {
    return { playerId: player.id, quality: "exact" };
  }
  const aliasHit = (player.aliases ?? []).some((alias) => normalized.includes(normalizeVoiceName(alias)));
  return { playerId: player.id, quality: aliasHit ? "alias" : "fuzzy" };
}

function retargetActions(actions: GameAction[], targetId: string): GameAction[] {
  return actions.map((action) => {
    if ("target" in action) {
      return { ...action, target: targetId } as GameAction;
    }
    return { ...action };
  });
}

export function resolvePendingClarification(
  transcript: string,
  context: VoiceContext | null | undefined,
): PendingClarificationResolution | null {
  const pending = context?.pendingClarification?.actions;
  if (!pending?.length) return null;

  const normalized = normalizeVoiceName(transcript);
  if (!normalized) {
    return { outcome: "clarify", clarification: "Could you repeat that?" };
  }

  if (YES_PATTERN.test(normalized)) {
    return { outcome: "apply", actions: cloneActions(pending), resolution: "confirmed", matchQuality: "exact" };
  }

  if (NO_PATTERN.test(normalized)) {
    return { outcome: "cancel", clarification: "Okay, cancelled.", resolution: "cancelled", matchQuality: "unresolved" };
  }

  const correctionText = normalized.replace(/^no[\s,]+/, "").replace(/^for\s+/, "").trim();
  const mention = resolveMention(correctionText || normalized, context?.players, context?.selfPlayerId);
  if (mention.playerId) {
    return {
      outcome: "apply",
      actions: retargetActions(pending, mention.playerId),
      resolution: "corrected",
      matchQuality: mention.quality,
    };
  }

  return {
    outcome: "clarify",
    clarification: "Did you mean yes, no, or a different player?",
    matchQuality: "unresolved",
  };
}

function buildAndMoreActions(lastActions: GameAction[], amount: number): GameAction[] | null {
  if (!lastActions.length) return null;
  const base = lastActions[0];
  if (base.action === "adjust_life") return [{ ...base, amount: amount >= 0 ? amount : base.amount }];
  if (base.action === "adjust_counter") return [{ ...base, amount }];
  if (base.action === "adjust_commander_damage") return [{ ...base, amount }];
  return null;
}

function buildSameForPlayerActions(lastActions: GameAction[], targetId: string): GameAction[] | null {
  if (!lastActions.length) return null;
  return retargetActions(lastActions, targetId);
}

export function resolveFollowUpCommand(
  transcript: string,
  context: VoiceContext | null | undefined,
): FollowUpResolution | null {
  const normalized = normalizeVoiceName(transcript);
  const lastActions = context?.followUpMemory?.lastActions ?? null;
  if (!normalized || !lastActions?.length) return null;

  if (UNDO_PATTERN.test(normalized)) {
    return {
      actions: [{ action: "undo" }],
      spokenConfirmation: "Undone.",
      matchQuality: "exact",
    };
  }

  const andMore = normalized.match(AND_MORE_PATTERN);
  if (andMore) {
    const amount = parseNumber(andMore[1] ?? "");
    if (amount != null) {
      const actions = buildAndMoreActions(lastActions, amount);
      if (actions?.length) {
        return {
          actions: validateActions(actions as unknown[], {
            players: context?.players,
            selfPlayerId: context?.selfPlayerId,
          }),
          spokenConfirmation: "Added more.",
          matchQuality: "exact",
        };
      }
    }
  }

  const sameForPlayer = normalized.match(SAME_FOR_PLAYER_PATTERN);
  if (sameForPlayer) {
    const mention = resolveMention(sameForPlayer[1] ?? "", context?.players, context?.selfPlayerId);
    if (mention.playerId) {
      const actions = buildSameForPlayerActions(lastActions, mention.playerId);
      if (actions?.length) {
        return {
          actions: validateActions(actions as unknown[], {
            players: context?.players,
            selfPlayerId: context?.selfPlayerId,
          }),
          spokenConfirmation: "Done.",
          matchQuality: mention.quality,
        };
      }
    }
  }

  if (/\bhim\b|\bher\b|\bthem\b/.test(normalized) && context?.followUpMemory?.lastTargetId) {
    const actions = retargetActions(lastActions, context.followUpMemory.lastTargetId);
    return {
      actions,
      spokenConfirmation: "Done.",
      matchQuality: "exact",
    };
  }

  return null;
}

export function summarizeMatchQuality(
  transcript: string,
  actions: GameAction[] | null | undefined,
  players: VoicePlayerRef[] | undefined,
): VoiceTargetMatchQuality {
  if (!actions?.length || !players?.length) return "unresolved";
  const targetId = firstTargetPlayerId(actions) ?? firstSourcePlayerId(actions);
  if (!targetId) return "unresolved";
  const player = players.find((entry) => entry.id === targetId);
  if (!player) return "unresolved";

  const normalized = normalizeVoiceName(transcript);
  if (!normalized) return "unresolved";
  if (normalized.includes(normalizeVoiceName(player.name))) return "exact";
  if ((player.aliases ?? []).some((alias) => normalized.includes(normalizeVoiceName(alias)))) return "alias";
  return "fuzzy";
}
