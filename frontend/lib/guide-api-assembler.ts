/**
 * Assembles extended guide JSON for GET /api/commanders/[slug]/guide (mobile hub + backward-compatible fields).
 */

import type { CommanderProfile } from "@/lib/commanders";
import {
  renderCommanderIntro,
  renderMulliganGuideContent,
  renderBestCardsContent,
  renderBudgetUpgradesContent,
  renderHowDeckWins,
  renderCommonMistakes,
  deriveCommanderSnapshot,
  renderStrategySnapshot,
  MULLIGAN_FAQ,
  BEST_CARDS_FAQ,
  BUDGET_FAQ,
} from "@/lib/seo/commander-content";
type FaqItem = { q: string; a: string };

export type MobileGuideSection = {
  id: string;
  title: string;
  kind: "prose" | "blocks";
  prose?: string;
  blocks?: Array<{ heading?: string; body: string }>;
};

/** Dedupe shared FAQ blocks (same Q repeated across legacy groupings). */
export function mergeCommanderGuideFaqs(): FaqItem[] {
  const seen = new Set<string>();
  const out: FaqItem[] = [];
  for (const item of [...MULLIGAN_FAQ, ...BEST_CARDS_FAQ, ...BUDGET_FAQ]) {
    const k = item.q.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function renderElevatorPitch(profile: CommanderProfile): string {
  const blurb = profile.blurb?.trim();
  if (blurb) {
    return blurb.length > 280 ? `${blurb.slice(0, 277)}…` : blurb;
  }
  const snap = renderStrategySnapshot(profile);
  return snap.length > 300 ? `${snap.slice(0, 297)}…` : snap;
}

export function renderStrengthsLine(profile: CommanderProfile): string {
  const coach = profile.coachNotes?.trim();
  if (coach) {
    const first = coach.split(/[.!?]\s+/)[0]?.trim();
    if (first && first.length > 12) return first.endsWith(".") ? first : `${first}.`;
  }
  const snap = deriveCommanderSnapshot(profile);
  const themes = snap.themes?.trim() || "its core synergies";
  return `Strong ${themes} lines with a clear ${snap.powerStyle.toLowerCase()} game plan.`;
}

export function renderWeaknessesLine(profile: CommanderProfile): string {
  if (profile.avoid?.length) {
    return `Watch for: ${profile.avoid.slice(0, 4).join("; ")}.`;
  }
  return `Greedy keeps and skipped interaction are common pitfalls—stable mana and answers matter.`;
}

export function renderUpgradePrioritiesLine(profile: CommanderProfile): string {
  const coach = profile.coachNotes?.trim();
  if (coach && coach.length > 40) {
    const parts = coach.split(/[.!?]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts.slice(1, 3).join(". ").trim() + (parts.length > 3 ? "…" : "");
  }
  return `Prioritize lands and ramp, then interaction, then payoffs that match ${profile.name}'s identity.`;
}

export function renderMulliganHeuristicsShort(profile: CommanderProfile): string {
  return `Aim for 2–4 lands, early plays, and a line to cast ${profile.name} on time. Ship low-action or all-spell openers unless your list is uniquely low-curve.`;
}

export function buildMobileGuideSections(profile: CommanderProfile): MobileGuideSection[] {
  return [
    {
      id: "overview",
      title: "Overview",
      kind: "prose",
      prose: renderCommanderIntro(profile, "hub"),
    },
    {
      id: "how-wins",
      title: "How this deck wins",
      kind: "prose",
      prose: renderHowDeckWins(profile),
    },
    {
      id: "mulligan",
      title: "Mulligan & opening hands",
      kind: "blocks",
      blocks: renderMulliganGuideContent(profile),
    },
    {
      id: "best-cards",
      title: "Best cards & roles",
      kind: "blocks",
      blocks: renderBestCardsContent(profile),
    },
    {
      id: "budget",
      title: "Budget upgrade path",
      kind: "blocks",
      blocks: renderBudgetUpgradesContent(profile),
    },
    {
      id: "mistakes",
      title: "Common mistakes",
      kind: "prose",
      prose: renderCommonMistakes(profile),
    },
  ];
}
