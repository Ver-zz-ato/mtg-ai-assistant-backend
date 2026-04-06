/**
 * Banned cards source: app_config first (updated by cron), then bundled JSON fallback.
 * Used by deck/analyze and validation. Same shape as banned_cards.json.
 *
 * Cron: `/api/cron/mtg-legality-refresh` (weekly) writes `banned_cards` + optional `mtg_legality_sync_status`.
 * Manual banned-only: `/api/cron/update-banned-lists`.
 */
import { createClient } from "@/lib/supabase/server";
import bannedCardsData from "./banned_cards.json";

export type BannedCardsData = {
  Commander: string[];
  Modern: string[];
  Pioneer: string[];
  Standard: string[];
  Pauper: string[];
  Brawl: string[];
};

const BUNDLED: BannedCardsData = bannedCardsData as BannedCardsData;

export async function getBannedCards(): Promise<BannedCardsData> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "banned_cards")
      .maybeSingle();

    if (error || !data?.value) return BUNDLED;

    const val = data.value as BannedCardsData;
    if (
      !val ||
      typeof val !== "object" ||
      !Array.isArray(val.Commander) ||
      !Array.isArray(val.Modern)
    ) {
      return BUNDLED;
    }

    return {
      Commander: Array.isArray(val.Commander) ? val.Commander : [],
      Modern: Array.isArray(val.Modern) ? val.Modern : [],
      Pioneer: Array.isArray(val.Pioneer) ? val.Pioneer : [],
      Standard: Array.isArray(val.Standard) ? val.Standard : [],
      Pauper: Array.isArray(val.Pauper) ? val.Pauper : [],
      Brawl: Array.isArray(val.Brawl) ? val.Brawl : [],
    };
  } catch {
    return BUNDLED;
  }
}

/** Build format -> Set(cardName) for O(1) banned checks. */
export function bannedDataToMaps(
  data: BannedCardsData
): Record<string, Record<string, true>> {
  const toMap = (arr: string[]) => {
    const m: Record<string, true> = {};
    for (const name of arr) m[name] = true;
    return m;
  };
  return {
    Commander: toMap(data.Commander),
    Modern: toMap(data.Modern),
    Pioneer: toMap(data.Pioneer),
    Standard: toMap(data.Standard),
    Pauper: toMap(data.Pauper),
    Brawl: toMap(data.Brawl),
  };
}
