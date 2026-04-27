/**
 * PostgREST/Supabase returns at most 1000 rows per request unless `.range()` is used.
 * Use this helper when you need the full result set.
 *
 * @param queryFactory Return a **fresh** base query (no `.range` yet) with a **stable** `.order(…)`
 *   (e.g. primary key `id`) so pages are consistent.
 * @example
 *   await fetchAllSupabaseRows(() =>
 *     supabase.from("collection_cards").select("id, name, qty")
 *       .eq("collection_id", id).order("id", { ascending: true })
 *   );
 */
export const DEFAULT_SUPABASE_PAGE_SIZE = 1000;

export async function fetchAllSupabaseRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFactory: () => any,
  pageSize = DEFAULT_SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    // Supabase: builder after .range() is thenable; await runs the request.
    const { data, error } = await queryFactory().range(from, to);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
