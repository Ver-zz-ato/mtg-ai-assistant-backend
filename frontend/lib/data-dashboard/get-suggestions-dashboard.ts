/**
 * Read-only suggestions dashboard from ai_suggestion_outcomes.
 * Supports accepted, rejected, ignored outcomes and acceptance rate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SuggestionsDashboard = {
  totalAccepted: number;
  totalRejected: number;
  totalIgnored: number;
  acceptedToday: number;
  acceptedLast7: number;
  uniqueSuggestionIds: number;
  uniqueSuggestedCards: number;
  uniqueDecksWithAccepted: number;
  outcomeSummary: Array<{ outcome_type: string; count: number }>;
  topAcceptedCards: { card: string; count: number }[];
  topRejectedCards: { card: string; count: number }[];
  topIgnoredCards: { card: string; count: number }[];
  acceptanceQuality: Array<{
    card: string;
    accepted_count: number;
    rejected_count: number;
    ignored_count: number;
    total_outcomes: number;
    acceptance_rate: number;
  }>;
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
    accepted: boolean | null;
    rejected: boolean | null;
    ignored: boolean | null;
    outcome_source: string | null;
    prompt_version_id: string | null;
  }>;
  prompt_version_summary: Array<{
    prompt_version_id: string | null;
    accepted_count: number;
    rejected_count: number;
    ignored_count: number;
    total_outcomes: number;
    decided_outcomes: number;
    acceptance_rate_decided_only: number | null;
    acceptance_rate_all: number | null;
  }>;
  prompt_version_by_category: Array<{
    prompt_version_id: string | null;
    category: string;
    accepted_count: number;
    rejected_count: number;
    ignored_count: number;
    total_outcomes: number;
    acceptance_rate_decided_only: number | null;
    acceptance_rate_all: number | null;
  }>;
  prompt_version_leaderboard: Array<{
    prompt_version_id: string | null;
    accepted_count: number;
    rejected_count: number;
    ignored_count: number;
    acceptance_rate_decided_only: number | null;
    total_outcomes: number;
  }>;
  prompt_version_card_leaderboard: Array<{
    prompt_version_id: string | null;
    suggested_card: string;
    accepted_count: number;
    rejected_count: number;
    ignored_count: number;
    total_outcomes: number;
    acceptance_rate_decided_only: number | null;
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

const MIN_SAMPLE_FOR_QUALITY = 3;

export async function getSuggestionsDashboard(admin: SupabaseClient): Promise<SuggestionsDashboard> {
  const out: SuggestionsDashboard = {
    totalAccepted: 0,
    totalRejected: 0,
    totalIgnored: 0,
    acceptedToday: 0,
    acceptedLast7: 0,
    uniqueSuggestionIds: 0,
    uniqueSuggestedCards: 0,
    uniqueDecksWithAccepted: 0,
    outcomeSummary: [],
    topAcceptedCards: [],
    topRejectedCards: [],
    topIgnoredCards: [],
    acceptanceQuality: [],
    byCategory: [],
    byCommander: [],
    recent: [],
    prompt_version_summary: [],
    prompt_version_by_category: [],
    prompt_version_leaderboard: [],
    prompt_version_card_leaderboard: [],
  };

  try {
    const { data: allRows } = await admin
      .from("ai_suggestion_outcomes")
      .select("id, created_at, suggested_card, deck_id, accepted, rejected, ignored, suggestion_id, prompt_version_id");
    const rows = allRows ?? [];
    out.totalAccepted = rows.filter((r: { accepted?: boolean | null }) => r.accepted === true).length;
    out.totalRejected = rows.filter((r: { rejected?: boolean | null }) => r.rejected === true).length;
    out.totalIgnored = rows.filter((r: { ignored?: boolean | null }) => r.ignored === true).length;
    const t0 = todayStart();
    const t7 = sevenDaysAgo();
    const acceptedRows = rows.filter((r: { accepted?: boolean | null }) => r.accepted === true);
    out.acceptedToday = acceptedRows.filter((r: { created_at?: string }) => String(r.created_at || "").localeCompare(t0) >= 0).length;
    out.acceptedLast7 = acceptedRows.filter((r: { created_at?: string }) => String(r.created_at || "").localeCompare(t7) >= 0).length;
    out.uniqueSuggestionIds = new Set(rows.map((r: { suggestion_id?: string }) => String(r.suggestion_id ?? "").trim()).filter(Boolean)).size;
    const cardsSet = new Set<string>();
    const decksSet = new Set<string>();
    acceptedRows.forEach((r: { suggested_card?: string | null; deck_id?: string | null }) => {
      if (r.suggested_card?.trim()) cardsSet.add(r.suggested_card.trim());
      if (r.deck_id) decksSet.add(String(r.deck_id));
    });
    out.uniqueSuggestedCards = cardsSet.size;
    out.uniqueDecksWithAccepted = decksSet.size;

    out.outcomeSummary = [
      { outcome_type: "accepted", count: out.totalAccepted },
      { outcome_type: "rejected", count: out.totalRejected },
      { outcome_type: "ignored", count: out.totalIgnored },
    ].filter((x) => x.count > 0);

    const byCardAcc = new Map<string, number>();
    const byCardRej = new Map<string, number>();
    const byCardIgn = new Map<string, number>();
    rows.forEach((r: { suggested_card?: string | null; accepted?: boolean | null; rejected?: boolean | null; ignored?: boolean | null }) => {
      const c = (r.suggested_card || "").trim();
      if (!c) return;
      if (r.accepted === true) byCardAcc.set(c, (byCardAcc.get(c) ?? 0) + 1);
      if (r.rejected === true) byCardRej.set(c, (byCardRej.get(c) ?? 0) + 1);
      if (r.ignored === true) byCardIgn.set(c, (byCardIgn.get(c) ?? 0) + 1);
    });
    out.topAcceptedCards = Array.from(byCardAcc.entries()).map(([card, count]) => ({ card, count })).sort((a, b) => b.count - a.count).slice(0, 25);
    out.topRejectedCards = Array.from(byCardRej.entries()).map(([card, count]) => ({ card, count })).sort((a, b) => b.count - a.count).slice(0, 25);
    out.topIgnoredCards = Array.from(byCardIgn.entries()).map(([card, count]) => ({ card, count })).sort((a, b) => b.count - a.count).slice(0, 25);

    const byCard = new Map<string, { accepted: number; rejected: number; ignored: number }>();
    rows.forEach((r: { suggested_card?: string | null; accepted?: boolean | null; rejected?: boolean | null; ignored?: boolean | null }) => {
      const c = (r.suggested_card || "").trim();
      if (!c) return;
      const cur = byCard.get(c) ?? { accepted: 0, rejected: 0, ignored: 0 };
      if (r.accepted === true) cur.accepted++;
      if (r.rejected === true) cur.rejected++;
      if (r.ignored === true) cur.ignored++;
      byCard.set(c, cur);
    });
    out.acceptanceQuality = Array.from(byCard.entries())
      .map(([card, v]) => {
        const total = v.accepted + v.rejected + v.ignored;
        return {
          card,
          accepted_count: v.accepted,
          rejected_count: v.rejected,
          ignored_count: v.ignored,
          total_outcomes: total,
          acceptance_rate: total > 0 ? v.accepted / total : 0,
        };
      })
      .filter((x) => x.total_outcomes >= MIN_SAMPLE_FOR_QUALITY)
      .sort((a, b) => b.total_outcomes - a.total_outcomes)
      .slice(0, 50);

    const byPv = new Map<string | null, { accepted: number; rejected: number; ignored: number }>();
    rows.forEach((r: { prompt_version_id?: string | null; accepted?: boolean | null; rejected?: boolean | null; ignored?: boolean | null }) => {
      const pv = r.prompt_version_id != null && String(r.prompt_version_id).trim() !== "" ? String(r.prompt_version_id).trim() : null;
      const cur = byPv.get(pv) ?? { accepted: 0, rejected: 0, ignored: 0 };
      if (r.accepted === true) cur.accepted++;
      if (r.rejected === true) cur.rejected++;
      if (r.ignored === true) cur.ignored++;
      byPv.set(pv, cur);
    });
    out.prompt_version_summary = Array.from(byPv.entries())
      .map(([prompt_version_id, v]) => {
        const total = v.accepted + v.rejected + v.ignored;
        const decided = v.accepted + v.rejected;
        return {
          prompt_version_id,
          accepted_count: v.accepted,
          rejected_count: v.rejected,
          ignored_count: v.ignored,
          total_outcomes: total,
          decided_outcomes: decided,
          acceptance_rate_decided_only: decided > 0 ? v.accepted / decided : null,
          acceptance_rate_all: total > 0 ? v.accepted / total : null,
        };
      })
      .sort((a, b) => b.decided_outcomes - a.decided_outcomes);

    const minDecidedForLeaderboard = 3;
    out.prompt_version_leaderboard = out.prompt_version_summary
      .filter((x) => x.decided_outcomes >= minDecidedForLeaderboard)
      .map(({ prompt_version_id, accepted_count, rejected_count, ignored_count, acceptance_rate_decided_only, total_outcomes }) => ({
        prompt_version_id,
        accepted_count,
        rejected_count,
        ignored_count,
        acceptance_rate_decided_only,
        total_outcomes,
      }))
      .sort((a, b) => (b.acceptance_rate_decided_only ?? 0) - (a.acceptance_rate_decided_only ?? 0));
  } catch {}

  try {
    const { data } = await admin
      .from("ai_suggestion_outcomes")
      .select("category")
      .or("accepted.eq.true,rejected.eq.true,ignored.eq.true");
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
      .or("accepted.eq.true,rejected.eq.true,ignored.eq.true");
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
    const { data: pvCatRows } = await admin
      .from("ai_suggestion_outcomes")
      .select("prompt_version_id, category, accepted, rejected, ignored");
    const pvCatMap = new Map<string, { accepted: number; rejected: number; ignored: number }>();
    (pvCatRows ?? []).forEach((r: { prompt_version_id?: string | null; category?: string | null; accepted?: boolean | null; rejected?: boolean | null; ignored?: boolean | null }) => {
      const pv = r.prompt_version_id != null && String(r.prompt_version_id).trim() !== "" ? String(r.prompt_version_id).trim() : null;
      const cat = (r.category ?? "").trim() || "[uncategorized]";
      const key = `${pv}\t${cat}`;
      const cur = pvCatMap.get(key) ?? { accepted: 0, rejected: 0, ignored: 0 };
      if (r.accepted === true) cur.accepted++;
      if (r.rejected === true) cur.rejected++;
      if (r.ignored === true) cur.ignored++;
      pvCatMap.set(key, cur);
    });
    out.prompt_version_by_category = Array.from(pvCatMap.entries())
      .map(([key, v]) => {
        const sep = key.indexOf("\t");
        const prompt_version_idRaw = sep >= 0 ? key.slice(0, sep) : key;
        const category = sep >= 0 ? key.slice(sep + 1) : "[uncategorized]";
        const prompt_version_id = prompt_version_idRaw === "null" ? null : prompt_version_idRaw;
        const total = v.accepted + v.rejected + v.ignored;
        const decided = v.accepted + v.rejected;
        return {
          prompt_version_id,
          category,
          accepted_count: v.accepted,
          rejected_count: v.rejected,
          ignored_count: v.ignored,
          total_outcomes: total,
          acceptance_rate_decided_only: decided > 0 ? v.accepted / decided : null,
          acceptance_rate_all: total > 0 ? v.accepted / total : null,
        };
      })
      .sort((a, b) => b.total_outcomes - a.total_outcomes)
      .slice(0, 100);
  } catch {}

  try {
    const { data: pvCardRows } = await admin
      .from("ai_suggestion_outcomes")
      .select("prompt_version_id, suggested_card, accepted, rejected, ignored");
    const pvCardMap = new Map<string, { accepted: number; rejected: number; ignored: number }>();
    (pvCardRows ?? []).forEach((r: { prompt_version_id?: string | null; suggested_card?: string | null; accepted?: boolean | null; rejected?: boolean | null; ignored?: boolean | null }) => {
      const card = (r.suggested_card ?? "").trim();
      if (!card) return;
      const pv = r.prompt_version_id != null && String(r.prompt_version_id).trim() !== "" ? String(r.prompt_version_id).trim() : null;
      const key = `${pv}\t${card}`;
      const cur = pvCardMap.get(key) ?? { accepted: 0, rejected: 0, ignored: 0 };
      if (r.accepted === true) cur.accepted++;
      if (r.rejected === true) cur.rejected++;
      if (r.ignored === true) cur.ignored++;
      pvCardMap.set(key, cur);
    });
    const minCardSample = 2;
    out.prompt_version_card_leaderboard = Array.from(pvCardMap.entries())
      .map(([key, v]) => {
        const sep = key.indexOf("\t");
        const prompt_version_idRaw = sep >= 0 ? key.slice(0, sep) : key;
        const suggested_card = sep >= 0 ? key.slice(sep + 1) : "";
        const prompt_version_id = prompt_version_idRaw === "null" ? null : prompt_version_idRaw;
        const total = v.accepted + v.rejected + v.ignored;
        const decided = v.accepted + v.rejected;
        return {
          prompt_version_id,
          suggested_card,
          accepted_count: v.accepted,
          rejected_count: v.rejected,
          ignored_count: v.ignored,
          total_outcomes: total,
          acceptance_rate_decided_only: decided > 0 ? v.accepted / decided : null,
        };
      })
      .filter((x) => x.total_outcomes >= minCardSample)
      .sort((a, b) => (b.acceptance_rate_decided_only ?? 0) - (a.acceptance_rate_decided_only ?? 0))
      .slice(0, 50);
  } catch {}

  try {
    const { data } = await admin
      .from("ai_suggestion_outcomes")
      .select("created_at, suggested_card, category, commander, format, deck_id, suggestion_id, accepted, rejected, ignored, outcome_source, prompt_version_id")
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
      accepted: r.accepted != null ? Boolean(r.accepted) : null,
      rejected: r.rejected != null ? Boolean(r.rejected) : null,
      ignored: r.ignored != null ? Boolean(r.ignored) : null,
      outcome_source: r.outcome_source != null ? String(r.outcome_source) : null,
      prompt_version_id: r.prompt_version_id != null ? String(r.prompt_version_id) : null,
    }));
  } catch {}

  return out;
}
