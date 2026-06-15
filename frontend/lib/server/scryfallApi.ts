/** Scryfall requires a non-default User-Agent on all API requests. */
export const SCRYFALL_API_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent": "ManaTap-AI/1.0 (https://manatap.ai)",
};

export async function scryfallGetJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", headers: SCRYFALL_API_HEADERS });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}
