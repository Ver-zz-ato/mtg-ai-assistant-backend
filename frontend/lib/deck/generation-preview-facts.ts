/**
 * Additive preview stats for deck generation responses.
 * Reuses buildDeckContextSummary / deck_facts — best-effort only.
 */

import { buildDeckContextSummary } from "@/lib/deck/deck-context-summary";

export type GenerationPreviewFacts = {
  land_count: number;
  ramp_count: number;
  draw_count: number;
  interaction_count: number;
  avg_cmc: number;
  curve_histogram: number[];
  curve_profile?: string;
  warning_flags?: string[];
};

export async function buildGenerationPreviewFacts(
  deckText: string,
  commander: string | null,
  format: "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper" = "Commander",
): Promise<GenerationPreviewFacts | undefined> {
  try {
    const s = await buildDeckContextSummary(deckText, { format, commander });
    const df = s.deck_facts;
    if (df) {
      return {
        land_count: df.land_count,
        ramp_count: df.ramp_count,
        draw_count: df.draw_count,
        interaction_count: df.interaction_count,
        avg_cmc: Math.round(df.avg_cmc * 100) / 100,
        curve_histogram: [...df.curve_histogram],
        curve_profile: df.curve_profile,
        warning_flags: [...new Set([...(df.uncertainty_flags ?? []), ...s.warning_flags])],
      };
    }
    return {
      land_count: s.land_count,
      ramp_count: s.ramp,
      draw_count: s.draw,
      interaction_count: s.removal,
      avg_cmc: 0,
      curve_histogram: [...s.curve_histogram],
      warning_flags: [...s.warning_flags],
    };
  } catch {
    return undefined;
  }
}
