/**
 * Read-only suggestions dashboard from ai_suggestion_outcomes.
 * Expects Supabase admin client (service role).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SuggestionsDashboard = {
  totalAccepted: number;
  acceptedToday: number;
  acceptedLast7: number;
  uniqueSuggestedCards: number;
  uniqueDecksWithAccepted: number;
  topAcceptedCards: { card: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byCommander: { commander: string; count: number }[];
  recent: Array<{
    created_at: string;
    suggested_card: string | null;
    category: string | null;
    commander: string | null;
    format: string | null;
    deck_id: string | null;
    suggestion_id: string;
  }>;
};

const todayStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};
const sevenDaysAgo = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

export async function getSuggestionsDashboard(admin: SupabaseClient): Promise<SuggestionsDashboard> {
  const out: SuggestionsDashboard = {
    totalAccepted: 0,
    acceptedToday: 0,
    acceptedLast7: 0,
    uniqueSuggestedCards: 0,
    uniqueDecksWithAccepted: 0,
    topAcceptedCards: [],
    byCategory: [],
    byCommander: [],
    recent: [],
  };

  try {
    const { data: accepted } = await admin
      .from("ai_suggestion_outcomes")
      .select("id, created_at, suggested_card, deck_id")
      .eq("accepted", true);
    const rows = accepted ?? [];
    out.totalAccepted = rows.length;
    const t0 = todayStart();
    const t7 = sevenDaysAgo();
    out.acceptedToday = rows.filter((r: { created_at?: string }) => String(r.created_at || "").localeCompare(t0) >= 0).length;
    out.acceptedLast7 = rows.filter((r: { created_at?: string }) => String(r.created_at || "").localeCompare(t7) >= 0).length;
    const cards = new Set<string>();
    const decks = new Set<string>();
    rows.forEach((r: { suggested_card?: string | null; deck_id?: string | null }) => {
      if (r.suggested_card?.trim()) cards.add(r.suggested_card.trim());
      if (r.deck_id) decks.add(String(r.deck_id));
    });
    out.uniqueSuggestedCards = cards.size;
    out.uniqueDecksWithAccepted = decks.size;
  } catch {}

  try {
    const { data } = await admin
      .from("ai_suggestion_outcomes")
      .select("suggested_card")
      .eq("accepted", true)
      .not("suggested_card", "is", null);
    const map = new Map<string, number>();
    (data ?? []).forEach((r: { suggested_card?: string | null }) => {
      const c = (r.suggested_card || "").trim();
      if (c) map.set(c, (map.get(c) ?? 0) + 1);
    });
    out.topAcceptedCards = Array.from(map.entries())
      .map(([card, count]) => ({ card, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  } catch {}

  try {
    const { data } = await admin
      .from("ai_suggestion_outcomes")
      .select("category")
      .eq("accepted", true);
    const map = new Map<string, number>();
    (data ?? []).forEach((r: { category?: string | null }) => {
      const c = r.category?.trim() || "(blank)";
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    out.byCategory = Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  } catch {}

  try {
    const { data } = await admin
      .from("ai_suggestion_outcomes")
      .select("commander")
      .eq("accepted", true);
    const map = new Map<string, number>();
    (data ?? []).forEach((r: { commander?: string | null }) => {
      const c = r.commander?.trim() || "(blank)";
      map.set(c, (map.get(c) ?? 0) + 1);
    });
    out.byCommander = Array.from(map.entries())
      .map(([commander, count]) => ({ commander, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);
  } catch {}

  try {
    const { data } = await admin
      .from("ai_suggestion_outcomes")
      .select("created_at, suggested_card, category, commander, format, deck_id, suggestion_id")
      .eq("accepted", true)
      .order("created_at", { ascending: false })
      .limit(50);
    out.recent = (data ?? []).map((r: Record<string, unknown>) => ({
      created_at: String(r.created_at ?? ""),
      suggested_card: r.suggested_card != null ? String(r.suggested_card) : null,
      category: r.category != null ? String(r.category) : null,
      commander: r.commander != null ? String(r.commander) : null,
      format: r.format != null ? String(r.format) : null,
      deck_id: r.deck_id != null ? String(r.deck_id) : null,
      suggestion_id: String(r.suggestion_id ?? ""),
    }));
  } catch {}

  return out;
}
