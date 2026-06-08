/**
 * Budget swaps source: app_config first (editable via admin/cron), then bundled JSON fallback.
 * Used by swap-suggestions API for Quick Swaps mode.
 */
import { createClient } from '@/lib/supabase/server';
import swapsData from './budget-swaps.json';

export type BudgetSwapsMap = Record<string, string[]>;

const BUNDLED: BudgetSwapsMap = (() => {
  const data = swapsData as { swaps?: Record<string, string[]> };
  const out: BudgetSwapsMap = {};
  for (const [key, values] of Object.entries(data.swaps || {})) {
    out[key.toLowerCase()] = values;
  }
  return out;
})();

export function mergeBudgetSwaps(base: BudgetSwapsMap, override: Record<string, string[]>): BudgetSwapsMap {
  const out: BudgetSwapsMap = { ...base };
  for (const [key, values] of Object.entries(override)) {
    if (Array.isArray(values) && values.length > 0) {
      const normalizedKey = key.toLowerCase();
      out[normalizedKey] = [...new Set([...(out[normalizedKey] ?? []), ...values])];
    }
  }
  return out;
}

export async function getBudgetSwaps(): Promise<BudgetSwapsMap> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'budget_swaps')
      .maybeSingle();

    if (error || !data?.value) return BUNDLED;

    const val = data.value as { swaps?: Record<string, string[]> };
    const entries = val?.swaps;
    if (!entries || typeof entries !== 'object') return BUNDLED;

    const out = mergeBudgetSwaps(BUNDLED, entries);
    return Object.keys(out).length > 0 ? out : BUNDLED;
  } catch {
    return BUNDLED;
  }
}

export { BUNDLED };
