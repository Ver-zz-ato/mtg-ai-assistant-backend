/**
 * Append today's commander_aggregates rows into commander_aggregates_history. Fail-open.
 */

import { getAdmin } from "@/app/api/_lib/supa";

/**
 * Copy current commander_aggregates into commander_aggregates_history for today.
 * Uses upsert on (snapshot_date, commander_slug).
 */
export async function snapshotCommanderAggregates(): Promise<boolean> {
  try {
    const admin = getAdmin();
    if (!admin) return false;

    const today = new Date().toISOString().slice(0, 10);

    const { data: rows, error: selectErr } = await admin
      .from("commander_aggregates")
      .select("commander_slug, deck_count, top_cards, recent_decks, median_deck_cost, updated_at");

    if (selectErr || !rows?.length) {
      if (selectErr) console.warn("[data-moat] snapshotCommanderAggregates select failed:", selectErr.message);
      return false;
    }

    const inserts = rows.map((r: Record<string, unknown>) => ({
      snapshot_date: today,
      commander_slug: r.commander_slug,
      deck_count: r.deck_count ?? null,
      top_cards: r.top_cards ?? null,
      recent_decks: r.recent_decks ?? null,
      raw: {
        median_deck_cost: r.median_deck_cost,
        updated_at: r.updated_at,
      },
    }));

    const { error: insErr } = await admin
      .from("commander_aggregates_history")
      .upsert(inserts, { onConflict: "snapshot_date,commander_slug" });

    if (insErr) {
      console.warn("[data-moat] snapshotCommanderAggregates insert failed:", insErr.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[data-moat] snapshotCommanderAggregates error:", e);
    return false;
  }
}
