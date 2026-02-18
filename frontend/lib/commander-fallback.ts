/**
 * Resolve commander data from public decks for slugs not in the curated list.
 * Used for dynamic fallback commander pages.
 */

import { getAdmin } from "@/app/api/_lib/supa";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export type FallbackCommanderData = {
  name: string;
  deckCount: number;
  recentDecks: Array<{ id: string; title: string; updated_at: string }>;
};

/**
 * Find commander name and basic stats from public decks when slug is not in curated list.
 * Returns null if no public decks match the slug.
 */
export async function getCommanderFromDecksBySlug(
  slug: string
): Promise<FallbackCommanderData | null> {
  const admin = getAdmin();
  if (!admin) return null;

  // Get distinct commanders from public Commander decks
  const { data: allDecks, error: decksError } = await admin
    .from("decks")
    .select("commander")
    .eq("is_public", true)
    .eq("format", "Commander")
    .not("commander", "is", null)
    .limit(5000);

  if (decksError || !allDecks || allDecks.length === 0) return null;

  const commanderNames = [...new Set(
    (allDecks as { commander: string }[]).map((d) => String(d.commander || "").trim()).filter(Boolean)
  )];
  const matchedName = commanderNames.find((n) => toSlug(n) === slug);
  if (!matchedName) return null;

  // Fetch deck count and recent decks for this commander (ilike for "Name" or "Name - Title")
  const pattern = `${matchedName}%`;
  const { data: matchingDecks, error: matchError } = await admin
    .from("decks")
    .select("id, title, updated_at")
    .eq("is_public", true)
    .eq("format", "Commander")
    .ilike("commander", pattern)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (matchError || !matchingDecks) return { name: matchedName, deckCount: 0, recentDecks: [] };

  const countResult = await admin
    .from("decks")
    .select("id", { count: "exact", head: true })
    .eq("is_public", true)
    .eq("format", "Commander")
    .ilike("commander", pattern);

  const deckCount = countResult.count ?? matchingDecks.length;
  const recentDecks = (matchingDecks as { id: string; title: string | null; updated_at: string | null }[])
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      title: d.title || "Untitled",
      updated_at: d.updated_at || new Date().toISOString(),
    }));

  return {
    name: matchedName,
    deckCount,
    recentDecks,
  };
}
