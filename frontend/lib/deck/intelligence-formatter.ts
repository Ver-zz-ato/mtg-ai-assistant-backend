/**
 * LLM-facing formatter: transform rich DeckFacts + SynergyDiagnostics into prose/bullet packets.
 */

import type { DeckFacts } from "./deck-facts";
import type { SynergyDiagnostics } from "./synergy-diagnostics";

const UNCERTAINTY_MESSAGES: Record<string, string> = {
  partial_enrichment: "Some diagnostics are lower-confidence because {count} cards were unresolved.",
  low_cache_coverage: "Cache coverage is incomplete; some facts may be approximate.",
  unclear_commander: "Commander not confirmed.",
  ambiguous_archetype: "Deck may be hybrid; primary plan is unclear.",
  legality_incomplete: "Legality for some cards could not be verified.",
  hybrid_plan_detected: "Deck appears to support multiple plans.",
};

export function formatForLLM(
  deckFacts: DeckFacts,
  synergyDiagnostics: SynergyDiagnostics
): string {
  const lines: string[] = ["Deck Facts:"];

  lines.push(`- Commander: ${deckFacts.commander ?? "Unknown"}`);
  lines.push(`- Colors: ${deckFacts.color_identity.length ? deckFacts.color_identity.join("") : "Colorless"}`);
  lines.push(`- Format: ${deckFacts.format}`);
  lines.push(`- Curve: ${deckFacts.avg_cmc.toFixed(1)} avg MV, ${deckFacts.curve_profile}`);
  lines.push(`- Lands: ${deckFacts.land_count} | Nonlands: ${deckFacts.nonland_count}`);
  lines.push(`- Ramp: ${deckFacts.ramp_count} | Draw: ${deckFacts.draw_count} | Interaction: ${deckFacts.interaction_count} | Sweepers: ${deckFacts.interaction_buckets.sweepers}`);

  const topArchetype = deckFacts.archetype_candidates[0];
  if (topArchetype && topArchetype.score > 0.5) {
    lines.push(`- Likely archetype: ${topArchetype.name} (${(topArchetype.score * 100).toFixed(0)}%)`);
  }

  if (synergyDiagnostics.core_cards.length) {
    lines.push(`- Core cards: ${synergyDiagnostics.core_cards.slice(0, 8).join(", ")}`);
  }
  if (synergyDiagnostics.support_cards.length) {
    lines.push(`- Support cards: ${synergyDiagnostics.support_cards.slice(0, 6).join(", ")}`);
  }
  if (synergyDiagnostics.peripheral_cards.length) {
    lines.push(`- Peripheral / flex: ${synergyDiagnostics.peripheral_cards.slice(0, 5).join(", ")}`);
  }

  if (synergyDiagnostics.missing_support.length) {
    lines.push(`- Main tension: ${synergyDiagnostics.missing_support.join("; ")}`);
  }
  if (synergyDiagnostics.tension_flags.length) {
    lines.push(`- Tensions: ${synergyDiagnostics.tension_flags.join("; ")}`);
  }

  if (synergyDiagnostics.low_synergy_candidates.length) {
    lines.push(`- Low-synergy candidates: ${synergyDiagnostics.low_synergy_candidates.slice(0, 6).join(", ")}`);
  }
  if (synergyDiagnostics.off_plan_candidates.length) {
    lines.push(`- Off-plan candidates: ${synergyDiagnostics.off_plan_candidates.slice(0, 4).join(", ")}`);
  }

  if (deckFacts.banned_cards.length) {
    lines.push(`- Banned in ${deckFacts.format}: ${deckFacts.banned_cards.join(", ")}`);
  }
  if (deckFacts.off_color_cards.length) {
    lines.push(`- Off-color: ${deckFacts.off_color_cards.slice(0, 4).join(", ")}`);
  }

  const uncertaintyParts: string[] = [];
  const partialCount = deckFacts.partial_enrichment_count ?? 0;
  for (const flag of deckFacts.uncertainty_flags) {
    const msg = UNCERTAINTY_MESSAGES[flag]?.replace("{count}", String(partialCount)) ?? flag;
    uncertaintyParts.push(msg);
  }
  if (uncertaintyParts.length) {
    lines.push(`- Uncertainty: ${uncertaintyParts.join(" ")}`);
  }

  return lines.join("\n");
}
