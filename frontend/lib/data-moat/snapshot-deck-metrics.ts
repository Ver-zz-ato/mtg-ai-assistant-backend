/**
 * Insert one deck_metrics_snapshot row from an existing summary. Fail-open.
 */

import { getAdmin } from "@/app/api/_lib/supa";

export type DeckSummaryLike = {
  deck_hash?: string | null;
  format?: string | null;
  commander?: string | null;
  land_count?: number | null;
  ramp?: number | null;
  removal?: number | null;
  draw?: number | null;
  curve_histogram?: number[] | null;
  archetype_tags?: string[] | null;
  synergy_diagnostics?: unknown;
  deck_facts?: unknown;
};

/**
 * Write one row to deck_metrics_snapshot for the given deck and today, from a pre-built summary.
 * Uses upsert on (deck_id, snapshot_date). Call after deck_context_summary is built (e.g. in deck/analyze).
 */
export async function snapshotDeckMetricsForDeck(
  deckId: string,
  summary: DeckSummaryLike
): Promise<boolean> {
  try {
    const admin = getAdmin();
    if (!admin || !deckId?.trim()) return false;

    const today = new Date().toISOString().slice(0, 10);

    const row = {
      deck_id: deckId,
      deck_hash: summary.deck_hash ?? null,
      snapshot_date: today,
      format: summary.format ?? null,
      commander: summary.commander ?? null,
      land_count: summary.land_count ?? null,
      ramp_count: summary.ramp ?? null,
      removal_count: summary.removal ?? null,
      draw_count: summary.draw ?? null,
      curve_histogram: summary.curve_histogram ?? null,
      archetype_tags: Array.isArray(summary.archetype_tags) ? summary.archetype_tags : null,
      synergy_diagnostics: summary.synergy_diagnostics ?? null,
      deck_facts: summary.deck_facts ?? null,
    };

    const { error } = await admin
      .from("deck_metrics_snapshot")
      .upsert(row, { onConflict: "deck_id,snapshot_date" });

    if (error) {
      console.warn("[data-moat] snapshotDeckMetricsForDeck failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[data-moat] snapshotDeckMetricsForDeck error:", e);
    return false;
  }
}
