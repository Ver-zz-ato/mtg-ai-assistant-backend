/**
 * ManaTap mobile vs website attribution for `ai_usage`.
 *
 * Audit (writes): `recordAiUsage` in lib/ai/log-usage.ts (inserts into `ai_usage`).
 * Relevant columns: route, source_page, source, request_kind, layer0_*, model, tokens, cost_usd, latency_ms, etc.
 * `source` column exists (migration 066); used for ai_test, production_widget, admin paths, and now manatap_app.
 *
 * Client detection (backward compatible):
 * - Header: `X-ManaTap-Client: manatap_app` or `app`
 * - JSON body: `usageSource` or `usage_source` === `manatap_app` (case-insensitive)
 * Eval runs: when `eval_run_id` is non-empty, `source` is always `ai_test` (wins over app marker).
 */
export const AI_USAGE_SOURCE_MANATAP_APP = "manatap_app";

export function resolveAiUsageSourceForRequest(
  req: Request,
  body: unknown,
  evalRunId: string | null | undefined
): string | undefined {
  const er = evalRunId != null && String(evalRunId).trim() ? String(evalRunId).trim() : null;
  if (er) return "ai_test";

  const h = req.headers.get("x-manatap-client")?.trim().toLowerCase() ?? "";
  if (h === "manatap_app" || h === "app") return AI_USAGE_SOURCE_MANATAP_APP;

  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    const v = o.usageSource ?? o.usage_source;
    if (typeof v === "string" && v.trim().toLowerCase() === "manatap_app") {
      return AI_USAGE_SOURCE_MANATAP_APP;
    }
  }
  return undefined;
}

/** Admin queries: treat row as app traffic if source marker or source_page prefix. */
export function isAppAiUsageRow(row: {
  source?: string | null;
  source_page?: string | null;
}): boolean {
  const s = row.source != null ? String(row.source).trim() : "";
  if (s === AI_USAGE_SOURCE_MANATAP_APP) return true;
  const sp = row.source_page != null ? String(row.source_page).trim() : "";
  if (sp.toLowerCase().startsWith("app_")) return true;
  return false;
}
