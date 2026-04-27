import assert from "node:assert";
import { fetchAllSupabaseRows, DEFAULT_SUPABASE_PAGE_SIZE } from "@/lib/supabase/fetchAllRows";

/**
 * Two pages: full first page + partial second page (simulates PostgREST 1000-row default cap).
 */
void (async () => {
  let call = 0;
  const out = await fetchAllSupabaseRows<{ id: number }>(
    () => ({
      range(_from: number, _to: number) {
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            data: new Array(DEFAULT_SUPABASE_PAGE_SIZE)
              .fill(0)
              .map((_, i) => ({ id: i })),
            error: null,
          });
        }
        if (call === 2) {
          return Promise.resolve({
            data: [
              { id: DEFAULT_SUPABASE_PAGE_SIZE },
              { id: DEFAULT_SUPABASE_PAGE_SIZE + 1 },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      },
    }),
    DEFAULT_SUPABASE_PAGE_SIZE,
  );

  assert.equal(out.length, DEFAULT_SUPABASE_PAGE_SIZE + 2);
  assert.equal(out[0].id, 0);
  assert.equal(out[DEFAULT_SUPABASE_PAGE_SIZE].id, DEFAULT_SUPABASE_PAGE_SIZE);
  console.log("fetchAllSupabaseRows.test.ts passed");
})();
