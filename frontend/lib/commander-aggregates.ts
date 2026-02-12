import { createClient } from "@/lib/supabase/server";

export interface CommanderAggregates {
  topCards: Array<{ cardName: string; count: number; percent: number }>;
  deckCount: number;
  recentDecks: Array<{ id: string; title: string; updated_at: string }>;
}

/** Read cached commander aggregates. Returns null if stale or missing. */
export async function getCommanderAggregates(
  slug: string
): Promise<CommanderAggregates | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commander_aggregates")
    .select("top_cards, deck_count, recent_decks")
    .eq("commander_slug", slug)
    .maybeSingle();

  if (error || !data) return null;

  return {
    topCards: (data.top_cards as CommanderAggregates["topCards"]) ?? [],
    deckCount: Number(data.deck_count) ?? 0,
    recentDecks: (data.recent_decks as CommanderAggregates["recentDecks"]) ?? [],
  };
}
