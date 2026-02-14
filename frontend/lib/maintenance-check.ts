/**
 * Server-side maintenance mode check for AI routes.
 * Use this inside route handlers as defense-in-depth (middleware already blocks most routes).
 * Ensures admin-triggered AI calls (e.g. batch tests) also respect maintenance.
 */
import { getServerSupabase } from '@/lib/server-supabase';

export type MaintenanceResult =
  | { enabled: false }
  | { enabled: true; message: string };

export async function checkMaintenance(): Promise<MaintenanceResult> {
  if (process.env.MAINTENANCE_HARD_READONLY === '1') {
    return { enabled: true, message: 'Maintenance mode (env) — writes paused' };
  }
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'maintenance')
      .maybeSingle();
    const m = (data as { value?: { enabled?: boolean; message?: string } } | null)?.value;
    if (m?.enabled) {
      return { enabled: true, message: String(m?.message || 'Maintenance mode — writes paused') };
    }
  } catch {
    /* allow on failure */
  }
  return { enabled: false };
}
