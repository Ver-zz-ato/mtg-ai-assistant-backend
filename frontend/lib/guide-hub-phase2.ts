/**
 * Commander Hub Phase 2 — structured identity, intent routes, and visual-first sections
 * (additive JSON; legacy prose fields remain assembled elsewhere).
 */

import type { CommanderProfile } from "@/lib/commanders";
import type { CommanderSnapshot } from "@/lib/seo/commander-content";
import {
  deriveCommanderSnapshot,
  renderCommanderIntro,
  renderMulliganGuideContent,
  renderBestCardsContent,
  renderBudgetUpgradesContent,
  renderHowDeckWins,
  renderCommonMistakes,
} from "@/lib/seo/commander-content";

export type CommanderIdentityCard = {
  bestFor?: string;
  typicalPower?: string;
  complexity?: string;
  budgetDifficulty?: string;
  primaryPlan?: string;
  secondaryAngle?: string;
  tableFit?: string;
  commonBuildDirection?: string;
  keyThemeTags?: string[];
  /** Short bullets — from profile.avoid + light templates */
  watchOuts?: string[];
  styleNotes?: string;
  commonTraps?: string[];
};

export type IntentActionDef = {
  id: "build" | "analyze" | "public" | "mulligan" | "budget" | "learn";
  label: string;
  subtitle: string;
  emoji: string;
};

export type HubSectionVisual = {
  id: string;
  title: string;
  format: "overview_compact" | "heuristics" | "rows" | "priorities" | "warnings" | "checklist";
  lead?: string;
  bullets?: string[];
  callouts?: { variant: "warning" | "tip" | "info"; text: string }[];
  rows?: { label: string; value: string }[];
  checklist?: { done?: boolean; text: string }[];
  legacyProse?: string;
  legacyBlocks?: Array<{ heading?: string; body: string }>;
};

export type CommunityBlock = {
  title: string;
  subtitle: string;
  deckCount?: number;
  decks: Array<{ id: string; title: string; updatedLabel: string }>;
};

function splitSentences(text: string, max: number): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const parts = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, max);
}

function deriveTraps(profile: CommanderProfile, snapshot: CommanderSnapshot): string[] {
  const traps: string[] = [];
  if (profile.avoid?.length) traps.push(...profile.avoid.slice(0, 3));
  if (snapshot.powerStyle === "Combo") traps.push("Fragile combos without protection or redundancy");
  if (snapshot.powerStyle === "Aggro") traps.push("Running out of gas after an early all-in");
  if (traps.length < 2) {
    traps.push("Skipping interaction for more redundant win-more threats");
  }
  return [...new Set(traps)].slice(0, 5);
}

export function buildCommanderIdentityCard(
  profile: CommanderProfile,
  snapshot: CommanderSnapshot,
  medianUsd: number | null,
): CommanderIdentityCard {
  const tags = profile.tags ?? [];
  const bestFor =
    tags.length > 0
      ? `Great if you enjoy ${tags.slice(0, 3).join(", ")} game play`
      : undefined;

  let budgetDifficulty = "Varies — tune to your collection";
  if (medianUsd != null && medianUsd > 0) {
    if (medianUsd < 250) {
      budgetDifficulty = `Accessible builds common (~$${Math.round(medianUsd)} median on ManaTap)`;
    } else if (medianUsd < 650) {
      budgetDifficulty = `Mid-range staples (~$${Math.round(medianUsd)} median)`;
    } else {
      budgetDifficulty = `Premium mana & staples common (~$${Math.round(medianUsd)} median)`;
    }
  }

  const tableFit =
    snapshot.difficulty === "Advanced"
      ? "Better when tables expect engines, interaction stacks, and answers"
      : snapshot.difficulty === "Easy"
        ? "Friendly for newer pods & lower-power leagues"
        : "Fits most casual-to-mid tables — match staples to your meta";

  const gp = snapshot.gameplan.trim();
  const primaryPlan = gp.split(/[.!]/)[0]?.trim() || gp;
  const secondaryAngle = snapshot.themes?.trim();

  return {
    bestFor,
    typicalPower: snapshot.powerStyle,
    complexity: snapshot.difficulty,
    budgetDifficulty,
    primaryPlan,
    secondaryAngle: secondaryAngle || undefined,
    tableFit,
    commonBuildDirection: profile.blurb?.trim() || undefined,
    keyThemeTags: tags.length ? tags : undefined,
    watchOuts: profile.avoid?.length ? profile.avoid.slice(0, 5) : undefined,
    styleNotes: profile.coachNotes?.trim() ? profile.coachNotes.trim().slice(0, 280) : undefined,
    commonTraps: deriveTraps(profile, snapshot),
  };
}

export function buildIntentActions(): IntentActionDef[] {
  return [
    { id: "build", label: "New deck", subtitle: "Commander + start in builder", emoji: "⚡" },
    { id: "analyze", label: "Improve a deck", subtitle: "Analyze or paste a list", emoji: "📊" },
    { id: "public", label: "Public decks", subtitle: "See lists on ManaTap", emoji: "🧪" },
    { id: "mulligan", label: "Mulligan lab", subtitle: "Opening-hand practice", emoji: "🎴" },
    { id: "budget", label: "Budget swaps", subtitle: "Same role, lower cost", emoji: "💎" },
    { id: "learn", label: "Learn strategy", subtitle: "Meta & discovery", emoji: "🔎" },
  ];
}

function mulliganBullets(profile: CommanderProfile, blocks: ReturnType<typeof renderMulliganGuideContent>): string[] {
  const bullets: string[] = [
    `Keep: 2–4 lands and a plan to cast ${profile.name} on curve when possible.`,
    `Ship: zero lands, all fat, or no interaction in faster metas.`,
  ];
  const firstBody = blocks.find((b) => b.body?.length)?.body;
  if (firstBody) {
    const s = splitSentences(firstBody, 2)[0];
    if (s && s.length > 20) bullets.push(s);
  }
  return bullets.slice(0, 5);
}

function budgetPriorities(blocks: ReturnType<typeof renderBudgetUpgradesContent>): HubSectionVisual {
  const rows = blocks
    .filter((b) => b.heading)
    .slice(0, 4)
    .map((b) => ({
      label: b.heading ?? "Step",
      value: b.body.slice(0, 140) + (b.body.length > 140 ? "…" : ""),
    }));
  return {
    id: "budget",
    title: "Budget upgrade path",
    format: "priorities",
    lead: "Hit these levers in order — biggest consistency wins first.",
    rows: rows.length ? rows : undefined,
    legacyBlocks: blocks,
  };
}

function bestCardsRows(blocks: ReturnType<typeof renderBestCardsContent>): HubSectionVisual {
  const rows = blocks
    .filter((b) => b.heading)
    .slice(0, 5)
    .map((b) => ({
      label: b.heading ?? "Role",
      value: b.body.slice(0, 130) + (b.body.length > 130 ? "…" : ""),
    }));
  return {
    id: "best-cards",
    title: "Best cards & roles",
    format: "rows",
    lead: "Cover these roles before chasing narrow synergies.",
    rows: rows.length ? rows : undefined,
    legacyBlocks: blocks,
  };
}

export function buildHubSectionsVisual(profile: CommanderProfile): HubSectionVisual[] {
  const snapshot = deriveCommanderSnapshot(profile);
  const intro = renderCommanderIntro(profile, "hub");
  const wins = renderHowDeckWins(profile);
  const mistakes = renderCommonMistakes(profile);
  const mulliganBlocks = renderMulliganGuideContent(profile);
  const bestBlocks = renderBestCardsContent(profile);
  const budgetBlocks = renderBudgetUpgradesContent(profile);

  const mistakeBullets = splitSentences(mistakes, 5);
  const winCallouts: { variant: "info" | "tip"; text: string }[] = splitSentences(wins, 2).map((text, i) => ({
    variant: i === 0 ? "info" : "tip",
    text,
  }));
  const trapCallouts = deriveTraps(profile, snapshot).map((text) => ({
    variant: "warning" as const,
    text,
  }));

  return [
    {
      id: "overview",
      title: "Overview",
      format: "overview_compact",
      lead: intro.slice(0, 220) + (intro.length > 220 ? "…" : ""),
      legacyProse: intro,
    },
    {
      id: "how-wins",
      title: "How you win",
      format: "checklist",
      callouts: winCallouts.length ? winCallouts : undefined,
      legacyProse: wins,
    },
    {
      id: "mulligan",
      title: "Keep / ship heuristics",
      format: "heuristics",
      bullets: mulliganBullets(profile, mulliganBlocks),
      legacyBlocks: mulliganBlocks,
    },
    bestCardsRows(bestBlocks),
    budgetPriorities(budgetBlocks),
    {
      id: "mistakes",
      title: "Common mistakes & traps",
      format: "warnings",
      bullets: mistakeBullets,
      callouts: trapCallouts.length ? trapCallouts : undefined,
      legacyProse: mistakes,
    },
  ];
}

export function formatDeckUpdatedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}wk ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function buildCommunityBlock(
  deckCount: number | undefined,
  recent: Array<{ id: string; title: string; updated_at: string }> | undefined,
): CommunityBlock | null {
  const decks = (recent ?? []).slice(0, 6).map((d) => ({
    id: d.id,
    title: d.title,
    updatedLabel: formatDeckUpdatedLabel(d.updated_at),
  }));
  if (!decks.length && !deckCount) return null;
  return {
    title: "Built by players on ManaTap",
    subtitle:
      "Real community decks — tap to open a list and see card choices (not prescriptive netdecks).",
    deckCount: deckCount && deckCount > 0 ? deckCount : undefined,
    decks,
  };
}
