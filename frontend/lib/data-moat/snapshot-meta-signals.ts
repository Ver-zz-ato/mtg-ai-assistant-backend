/**
 * Append today's meta_signals rows into meta_signals_history. Fail-open.
 */

import { getAdmin } from "@/app/api/_lib/supa";

/**
 * Copy current meta_signals into meta_signals_history for today (snapshot_date = today UTC).
 * Uses upsert on (snapshot_date, signal_type) so re-runs are idempotent.
 */
export async function snapshotMetaSignals(): Promise<boolean> {
  try {
    const admin = getAdmin();
    if (!admin) return false;

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const { data: rows, error: selectErr } = await admin
      .from("meta_signals")
      .select("signal_type, data");

    if (selectErr || !rows?.length) {
      if (selectErr) console.warn("[data-moat] snapshotMetaSignals select failed:", selectErr.message);
      return false;
    }

    const inserts = rows.map((r: { signal_type: string; data: unknown }) => ({
      snapshot_date: today,
      signal_type: r.signal_type,
      data: r.data ?? {},
    }));

    const { error: insErr } = await admin
      .from("meta_signals_history")
      .upsert(inserts, { onConflict: "snapshot_date,signal_type" });

    if (insErr) {
      console.warn("[data-moat] snapshotMetaSignals insert failed:", insErr.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[data-moat] snapshotMetaSignals error:", e);
    return false;
  }
}
