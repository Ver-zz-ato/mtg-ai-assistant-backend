import { getAdmin } from "@/app/api/_lib/supa";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Service-role client for trusted server writes after RLS hardening (Phase B). */
export function getServiceRoleSupabase(): SupabaseClient | null {
  return getAdmin();
}

export async function upsertScryfallCacheRows(
  rows: Record<string, unknown>[],
  opts?: { onConflict?: string }
): Promise<void> {
  if (!rows.length) return;
  const admin = getServiceRoleSupabase();
  if (!admin) return;
  await admin.from("scryfall_cache").upsert(rows, { onConflict: opts?.onConflict ?? "name" });
}

export async function insertShoutboxMessage(
  row: Record<string, unknown>
): Promise<{ id: number | null; error: string | null }> {
  const admin = getServiceRoleSupabase();
  if (!admin) return { id: null, error: "service_role_unconfigured" };
  const { data, error } = await admin
    .from("shoutbox_messages")
    .insert(row)
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: data?.id != null ? Number(data.id) : null, error: null };
}

export async function deleteShoutboxMessagesBefore(cutoffISO: string): Promise<{ count: number | null; error: string | null }> {
  const admin = getServiceRoleSupabase();
  if (!admin) return { count: null, error: "service_role_unconfigured" };
  const { error, count } = await admin
    .from("shoutbox_messages")
    .delete({ count: "exact" })
    .lt("created_at", cutoffISO);
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0, error: null };
}

export async function deleteShoutboxMessagesByIds(ids: Array<string | number>): Promise<{ error: string | null }> {
  const admin = getServiceRoleSupabase();
  if (!admin) return { error: "service_role_unconfigured" };
  const { error } = await admin.from("shoutbox_messages").delete().in("id", ids);
  return { error: error?.message ?? null };
}
