import { getServiceRoleClient } from "@/lib/server-supabase";

export type AiFeedbackListFilters = {
  since?: string | null;
  until?: string | null;
  client?: string | null;
  feature?: string | null;
  route?: string | null;
  surfaceKind?: string | null;
  rating?: number | null;
  status?: string | null;
  limit?: number;
  offset?: number;
};

export function parseTimeWindowPreset(
  preset: string | null,
): { since: string | null; until: string | null } {
  const now = Date.now();
  if (!preset || preset === "all") return { since: null, until: null };
  const hours: Record<string, number> = {
    "24h": 24,
    "2d": 48,
    "7d": 24 * 7,
  };
  const h = hours[preset];
  if (!h) return { since: null, until: null };
  return { since: new Date(now - h * 60 * 60 * 1000).toISOString(), until: null };
}

export async function queryAiFeedbackEvents(filters: AiFeedbackListFilters) {
  const db = getServiceRoleClient();
  if (!db) {
    return { ok: false as const, error: "missing_service_role" };
  }

  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  let q = db
    .from("ai_feedback_events")
    .select(
      "id, created_at, user_id, guest_key, client, feature, route, surface_kind, rating, comment, issue_types, user_input_text, ai_output_text, context_jsonb, submission_id, status, admin_notes",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (filters.since) q = q.gte("created_at", filters.since);
  if (filters.until) q = q.lte("created_at", filters.until);
  if (filters.client) q = q.eq("client", filters.client);
  if (filters.feature) q = q.eq("feature", filters.feature);
  if (filters.route) q = q.eq("route", filters.route);
  if (filters.surfaceKind) q = q.eq("surface_kind", filters.surfaceKind);
  if (filters.rating != null) q = q.eq("rating", filters.rating);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);

  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, rows: data ?? [], total: count ?? 0, limit, offset };
}

export async function getAiFeedbackEventById(id: string) {
  const db = getServiceRoleClient();
  if (!db) return { ok: false as const, error: "missing_service_role" };
  const { data, error } = await db.from("ai_feedback_events").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "not_found" };
  return { ok: true as const, row: data };
}

export async function aggregateAiFeedbackGroups(filters: {
  since?: string | null;
  until?: string | null;
  client?: string | null;
}) {
  const db = getServiceRoleClient();
  if (!db) return { ok: false as const, error: "missing_service_role" };

  let q = db.from("ai_feedback_events").select("feature, route");
  if (filters.since) q = q.gte("created_at", filters.since);
  if (filters.until) q = q.lte("created_at", filters.until);
  if (filters.client) q = q.eq("client", filters.client);

  const { data, error } = await q.limit(5000);
  if (error) return { ok: false as const, error: error.message };

  const byFeature: Record<string, number> = {};
  const byRoute: Record<string, number> = {};
  for (const row of data ?? []) {
    const f = String(row.feature ?? "unknown");
    const r = String(row.route ?? "—");
    byFeature[f] = (byFeature[f] ?? 0) + 1;
    byRoute[r] = (byRoute[r] ?? 0) + 1;
  }

  const topFeatures = Object.entries(byFeature)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([feature, count]) => ({ feature, count }));
  const topRoutes = Object.entries(byRoute)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([route, count]) => ({ route, count }));

  return { ok: true as const, byFeature: topFeatures, byRoute: topRoutes };
}

export function buildCursorExportPayload(
  items: Record<string, unknown>[],
  meta: Record<string, unknown>,
) {
  return {
    meta: {
      ...meta,
      exportedAt: new Date().toISOString(),
      count: items.length,
      reviewPrompt:
        "Review this ManaTap feedback batch. Suggest product and model/prompt improvements. Focus on recurring failures per feature, rating skew, and concrete copy/rule fixes.",
    },
    items,
  };
}
