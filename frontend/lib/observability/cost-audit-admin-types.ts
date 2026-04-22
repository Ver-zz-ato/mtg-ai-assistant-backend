export type CostAuditAdminRow = {
  id: string;
  created_at: string;
  source: string;
  event_name: string;
  route: string | null;
  method: string | null;
  request_id: string | null;
  session_id: string | null;
  user_id: string | null;
  is_anonymous: boolean | null;
  duration_ms: number | null;
  success: boolean | null;
  error_code: string | null;
  cache_hit: boolean | null;
  cache_key: string | null;
  source_detail: string | null;
  count_1: number | null;
  count_2: number | null;
  count_3: number | null;
  meta: Record<string, unknown>;
  component?: string | null;
  pathname?: string | null;
  correlation_id?: string | null;
  status_code?: number | null;
  parent_event_id?: string | null;
  persisted_from?: string | null;
};

export function metaStr(row: CostAuditAdminRow, k: string): string | null {
  const v = row.meta?.[k];
  if (v == null) return null;
  return String(v);
}

export function metaNum(row: CostAuditAdminRow, k: string): number | null {
  const v = row.meta?.[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
