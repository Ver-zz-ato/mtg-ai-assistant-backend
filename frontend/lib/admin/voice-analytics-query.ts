import { getAdmin } from "@/lib/supa";

export type VoiceAnalyticsFilters = {
  since?: string | null;
  until?: string | null;
  tier?: string | null;
  mode?: string | null;
  outcome?: string | null;
  screen?: string | null;
  matchQuality?: string | null;
  clarifyReason?: string | null;
  limit?: number;
  offset?: number;
};

export function parseTimeWindowPreset(preset: string | null | undefined): { since: string | null; until: string | null } {
  const now = new Date();
  const until = now.toISOString();
  switch (preset) {
    case "24h":
      return { since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), until };
    case "2d":
      return { since: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), until };
    case "7d":
      return { since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), until };
    default:
      return { since: null, until: null };
  }
}

export async function queryVoiceAnalytics(filters: VoiceAnalyticsFilters) {
  try {
    const admin = getAdmin();
    let query = admin
      .from("voice_interactions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(filters.offset ?? 0, (filters.offset ?? 0) + ((filters.limit ?? 80) - 1));

    if (filters.since) query = query.gte("created_at", filters.since);
    if (filters.until) query = query.lte("created_at", filters.until);
    if (filters.tier && filters.tier !== "all") query = query.eq("user_tier", filters.tier);
    if (filters.mode && filters.mode !== "all") query = query.eq("detected_mode", filters.mode);
    if (filters.outcome && filters.outcome !== "all") query = query.eq("final_outcome", filters.outcome);
    if (filters.screen && filters.screen !== "all") query = query.eq("screen", filters.screen);
    if (filters.matchQuality && filters.matchQuality !== "all") query = query.eq("match_quality", filters.matchQuality);
    if (filters.clarifyReason && filters.clarifyReason !== "all") query = query.eq("clarify_reason", filters.clarifyReason);

    const { data, error, count } = await query;
    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      rows: data ?? [],
      total: count ?? 0,
      limit: filters.limit ?? 80,
      offset: filters.offset ?? 0,
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "server_error" };
  }
}

export async function getVoiceAnalyticsById(id: string) {
  try {
    const admin = getAdmin();
    const { data, error } = await admin.from("voice_interactions").select("*").eq("id", id).maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!data) return { ok: false as const, error: "not_found" };
    return { ok: true as const, row: data };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "server_error" };
  }
}
