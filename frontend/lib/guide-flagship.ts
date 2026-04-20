/**
 * Flagship Commander Guides — premium modules + community copy (data-driven from commander profile JSON).
 */

import type { CommanderProfile, FlagshipGuideContent } from "@/lib/commanders";
import type { CommanderAggregates } from "@/lib/commander-aggregates";
import type { CommunityBlock } from "@/lib/guide-hub-phase2";
import { buildIntentActions as buildBaseIntentActions, type IntentActionDef } from "@/lib/guide-hub-phase2";

export function isFlagshipProfile(p: CommanderProfile): boolean {
  return p.guideTier === "flagship";
}

/** Payload merged into GET /api/commanders/[slug]/guide when tier === flagship and JSON has `flagship`. */
export type FlagshipGuidePayload = FlagshipGuideContent & {
  community?: {
    headline: string;
    subhead: string;
    metricsLine?: string;
  };
};

function buildMetricsLine(aggregates: CommanderAggregates | null): string | undefined {
  if (!aggregates) return undefined;
  const parts: string[] = [];
  const dc = aggregates.deckCount ?? 0;
  if (dc > 0) parts.push(`${dc} public deck${dc === 1 ? "" : "s"} on ManaTap`);
  if (aggregates.medianDeckCost != null && aggregates.medianDeckCost > 0) {
    parts.push(`~$${Math.round(aggregates.medianDeckCost)} median list`);
  }
  const staples = (aggregates.topCards ?? []).length;
  if (staples > 0) parts.push(`Top staples tracked from community lists`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Merges editorial flagship fields with aggregates for API + mobile. */
export function buildFlagshipGuidePayload(
  profile: CommanderProfile,
  aggregates: CommanderAggregates | null,
): FlagshipGuidePayload | null {
  if (!isFlagshipProfile(profile) || !profile.flagship) return null;
  const f = profile.flagship;
  const metricsLine = buildMetricsLine(aggregates);
  return {
    ...f,
    community: {
      headline: f.communityHeadline ?? "How people build this now",
      subhead:
        f.communitySubhead ??
        "Real ManaTap lists — open a deck to compare card choices (not a prescription).",
      ...(metricsLine ? { metricsLine } : {}),
    },
  };
}

/**
 * Enrich the Phase 2 community block for flagship: stronger headline/subhead + optional metrics line.
 */
export function enhanceCommunityBlockForFlagship(
  profile: CommanderProfile,
  base: CommunityBlock | null,
  aggregates: CommanderAggregates | null,
): CommunityBlock | null {
  if (!isFlagshipProfile(profile) || !profile.flagship) return base;

  const payload = buildFlagshipGuidePayload(profile, aggregates);
  if (!payload?.community) return base;

  const title = payload.community.headline;
  const sub = payload.community.subhead;
  const metrics = payload.community.metricsLine;
  const subtitle = [sub, metrics].filter(Boolean).join("\n\n");

  const decks = base?.decks ?? [];
  const deckCount =
    base?.deckCount ?? (aggregates && aggregates.deckCount > 0 ? aggregates.deckCount : undefined);

  return {
    title,
    subtitle,
    deckCount,
    decks,
  };
}

/** Stronger intent copy for flagship guides (same routes; better conversion language). */
export function buildIntentActionsForGuide(profile: CommanderProfile): IntentActionDef[] {
  const base = buildBaseIntentActions();
  if (!isFlagshipProfile(profile)) return base;
  return base.map((a) => {
    switch (a.id) {
      case "build":
        return { ...a, label: "Build a new deck", subtitle: `Start in the builder with ${profile.name.split(",")[0]}` };
      case "analyze":
        return { ...a, label: "Improve my deck", subtitle: "Analyze or paste your list" };
      case "public":
        return { ...a, label: "See public decks", subtitle: "What ManaTap players run" };
      case "mulligan":
        return { ...a, label: "Practice mulligans", subtitle: "Hands tuned to this curve" };
      case "budget":
        return { ...a, label: "Budget version", subtitle: "Same roles, lower cost" };
      case "learn":
        return { ...a, label: "Learn strategy", subtitle: "More guides & meta on Discover" };
      default:
        return a;
    }
  });
}
