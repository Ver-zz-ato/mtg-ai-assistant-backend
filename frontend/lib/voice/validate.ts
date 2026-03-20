/**
 * Action validation — reject malformed or unsafe LLM output.
 */

import type { GameAction } from "./types";

const LIFE_MAX = 999;
const LIFE_MIN = 0;
const COUNTER_MAX = 99;
const COUNTER_MIN = 0;
const COMMANDER_DAMAGE_MAX = 21;

const ALLOWED_ACTIONS = [
  "set_life",
  "adjust_life",
  "set_counter",
  "adjust_counter",
  "set_status",
  "set_commander_damage",
  "adjust_commander_damage",
  "undo",
] as const;

const ALLOWED_COUNTERS = ["poison", "energy", "experience", "rad", "storm"];
const ALLOWED_STATUSES = ["monarch", "initiative"];

export interface ValidateContext {
  players?: Array<{ id: string; name: string }>;
  selfPlayerId?: string;
}

/** Resolve target string to player id. Returns original if no match. */
function resolveTarget(target: string, ctx?: ValidateContext): string {
  if (!ctx?.players?.length) return target;
  const t = String(target).toLowerCase().trim();
  if (t === "me" || t === "my" || t === "self") return ctx.selfPlayerId ?? target;
  const byName = ctx.players.find((p) => p.name.toLowerCase() === t);
  if (byName) return byName.id;
  const byId = ctx.players.find((p) => p.id === target);
  if (byId) return byId.id;
  return target;
}

function saneNumber(n: unknown, min: number, max: number): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const v = Math.round(n);
  return v >= min && v <= max ? v : null;
}

export function validateActions(
  raw: unknown[],
  ctx?: ValidateContext
): GameAction[] {
  const out: GameAction[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const action = obj.action;

    if (typeof action !== "string" || !ALLOWED_ACTIONS.includes(action as typeof ALLOWED_ACTIONS[number])) {
      continue;
    }

    if (action === "undo") {
      out.push({ action: "undo" });
      continue;
    }

    const target = typeof obj.target === "string" ? obj.target.trim() : "";
    if (!target && action !== "undo") continue;

    const resolvedTarget = resolveTarget(target, ctx);

    switch (action) {
      case "set_life": {
        const value = saneNumber(obj.value, LIFE_MIN, LIFE_MAX);
        if (value !== null) out.push({ action: "set_life", target: resolvedTarget, value });
        break;
      }
      case "adjust_life": {
        const amount = saneNumber(obj.amount, -LIFE_MAX, LIFE_MAX);
        if (amount !== null) out.push({ action: "adjust_life", target: resolvedTarget, amount });
        break;
      }
      case "set_counter":
      case "adjust_counter": {
        const counter = typeof obj.counter === "string" && ALLOWED_COUNTERS.includes(obj.counter)
          ? obj.counter
          : null;
        if (!counter) break;

        if (action === "set_counter") {
          const value = saneNumber(obj.value, COUNTER_MIN, COUNTER_MAX);
          if (value !== null) out.push({ action: "set_counter", target: resolvedTarget, counter, value });
        } else {
          const amount = saneNumber(obj.amount, -COUNTER_MAX, COUNTER_MAX);
          if (amount !== null) out.push({ action: "adjust_counter", target: resolvedTarget, counter, amount });
        }
        break;
      }
      case "set_status": {
        const status = typeof obj.status === "string" && ALLOWED_STATUSES.includes(obj.status)
          ? obj.status
          : null;
        const value = obj.value === true || obj.value === false ? obj.value : null;
        if (status !== null && value !== null) {
          out.push({ action: "set_status", target: resolvedTarget, status, value });
        }
        break;
      }
      case "set_commander_damage":
      case "adjust_commander_damage": {
        const source = typeof obj.source === "string" ? resolveTarget(obj.source.trim(), ctx) : "";
        if (!source) break;

        if (action === "set_commander_damage") {
          const value = saneNumber(obj.value, 0, COMMANDER_DAMAGE_MAX);
          if (value !== null) {
            out.push({ action: "set_commander_damage", target: resolvedTarget, source, value });
          }
        } else {
          const amount = saneNumber(obj.amount, -COMMANDER_DAMAGE_MAX, COMMANDER_DAMAGE_MAX);
          if (amount !== null) {
            out.push({ action: "adjust_commander_damage", target: resolvedTarget, source, amount });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return out;
}
