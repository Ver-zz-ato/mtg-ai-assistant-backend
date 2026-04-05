import { sanitizedNameForDeckPersistence } from "@/lib/deck/cleanCardName";

/**
 * Bulk collection import (CSV / replace upload): map sanitized line → name to persist.
 * Calls same-origin POST /api/cards/fuzzy in chunks. Applies `suggestion` only when
 * `all` has exactly one candidate so multi-match rows are not silently auto-picked.
 */
export async function buildResolvedCollectionBulkNameMap(
  requestOrigin: string,
  rawNames: string[]
): Promise<Map<string, string>> {
  const toKey = (raw: string) =>
    sanitizedNameForDeckPersistence(String(raw)) || String(raw).trim();
  const uniqSanitized = [...new Set(rawNames.map(toKey).filter((s) => s.length > 0))];
  const out = new Map<string, string>();
  for (const s of uniqSanitized) out.set(s, s);

  for (let i = 0; i < uniqSanitized.length; i += 50) {
    const chunk = uniqSanitized.slice(i, i + 50);
    try {
      const fuzzyRes = await fetch(`${requestOrigin}/api/cards/fuzzy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: chunk }),
      });
      const fuzzyData = (await fuzzyRes.json().catch(() => ({}))) as {
        results?: Record<string, { suggestion?: string; all?: string[] }>;
      };
      const results = fuzzyData?.results ?? {};
      for (const key of chunk) {
        const entry = results[key];
        const all = entry?.all;
        const suggestion = entry?.suggestion;
        if (Array.isArray(all) && all.length === 1 && suggestion) out.set(key, suggestion);
      }
    } catch {
      /* keep sanitized defaults */
    }
  }
  return out;
}
