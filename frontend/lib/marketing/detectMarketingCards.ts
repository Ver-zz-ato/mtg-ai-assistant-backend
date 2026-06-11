import type { SupabaseClient } from "@supabase/supabase-js";
import { extractCardNames } from "@/lib/chat/enhancements";
import { normalizeCardName } from "@/lib/deck/mtgValidators";

export type DetectedCard = { name: string; verified?: boolean };

function normKey(name: string): string {
  return normalizeCardName(name).toLowerCase();
}

export async function detectMarketingCards(
  admin: SupabaseClient | null,
  text: string
): Promise<DetectedCard[]> {
  const candidates = extractCardNames(text);
  if (!candidates.length) return [];

  const unique = [...new Map(candidates.map((n) => [normKey(n), n])).values()].slice(0, 20);
  if (!admin) return unique.map((name) => ({ name }));

  const verified = new Set<string>();
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10);
    const { data } = await admin
      .from("scryfall_cache")
      .select("name")
      .in("name", batch);
    for (const row of data ?? []) {
      const n = (row as { name?: string }).name;
      if (n) verified.add(normKey(n));
    }
    const missing = batch.filter((n) => !verified.has(normKey(n)));
    for (const name of missing) {
      const { data: ilikeRows } = await admin
        .from("scryfall_cache")
        .select("name")
        .ilike("name", name)
        .limit(1);
      if (ilikeRows?.[0]) {
        const match = (ilikeRows[0] as { name: string }).name;
        verified.add(normKey(match));
      }
    }
  }

  return unique.map((name) => ({
    name,
    verified: verified.has(normKey(name)),
  }));
}
