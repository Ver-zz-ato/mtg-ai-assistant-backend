/**
 * Map precon set_name strings to Scryfall set released_at for release_year + release_date.
 * Uses one paginated fetch of /sets (cached per process).
 */

type ScryfallSetListResponse = {
  data?: ScryfallSet[];
  has_more?: boolean;
  next_page?: string | null;
};

export type ScryfallSet = {
  name: string;
  released_at: string | null;
};

async function fetchJson(url: string) {
  // eslint-disable-next-line no-restricted-globals -- Scryfall API (not app proxy)
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ManaTap-precon-sync" },
  });
  if (!res.ok) throw new Error(`Scryfall HTTP ${res.status}: ${url}`);
  return res.json();
}

/** All sets from Scryfall (paginated). */
export async function fetchAllScryfallSets(): Promise<ScryfallSet[]> {
  const out: ScryfallSet[] = [];
  let url: string | null = "https://api.scryfall.com/sets";
  while (url) {
    const page = (await fetchJson(url)) as ScryfallSetListResponse;
    const chunk = page.data || [];
    for (const s of chunk) {
      if (s?.name && typeof s.name === "string") {
        out.push({ name: s.name, released_at: s.released_at ?? null });
      }
    }
    url =
      page.has_more && page.next_page && typeof page.next_page === "string"
        ? page.next_page
        : null;
    if (url) await new Promise((r) => setTimeout(r, 75));
  }
  return out;
}

function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/\s*precon\s*decklist\s*$/i, "")
    .replace(/\s*commander\s*deck\s*$/i, "")
    .replace(/\s*commander\s*$/i, "")
    .replace(/^the\s+/i, "")
    .trim();
}

/** Higher is better. 0 = no meaningful match. */
function scoreMatch(queryNorm: string, setName: string): number {
  const n = setName.toLowerCase().trim();
  const q = queryNorm.trim();
  if (!q || !n) return 0;

  if (n === q) return 100_000;
  if (n.startsWith(q) || q.startsWith(n)) {
    return 80_000 - Math.abs(n.length - q.length);
  }
  if (n.includes(q)) return 60_000 - Math.abs(n.length - q.length);
  if (q.includes(n)) return 55_000 - Math.abs(n.length - q.length);

  const qt = new Set(q.split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  const ntokens = n.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  let overlap = 0;
  for (const t of ntokens) {
    if (qt.has(t)) overlap++;
  }
  if (overlap === 0) return 0;
  const jaccard =
    overlap / Math.max(1, new Set([...qt, ...ntokens]).size);
  return Math.floor(jaccard * 40_000);
}

/** Reject weak overlaps so we don't pin decks to the wrong set release date. */
const MIN_SCORE = 20_000;

/**
 * Pick the Scryfall set best matching a Westly/Moxfield set_name (parenthetical).
 */
export function findBestScryfallSet(
  setName: string,
  sets: ScryfallSet[]
): ScryfallSet | null {
  const qn = normalizeQuery(setName);
  if (!qn || qn === "unknown") return null;

  let best: ScryfallSet | null = null;
  let bestScore = 0;

  for (const s of sets) {
    if (!s.released_at) continue;
    const sc = scoreMatch(qn, s.name);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }

  if (!best || bestScore < MIN_SCORE) return null;
  return best;
}

export type EnrichablePreconRow = {
  set_name: string;
  release_year: number | null;
  release_date: string | null;
};

/**
 * Fill release_date (YYYY-MM-DD) and release_year from Scryfall when a confident match exists.
 * Leaves title-derived values when no match.
 */
export async function enrichPreconRowsFromScryfall<T extends EnrichablePreconRow>(
  rows: T[]
): Promise<{ matched: number }> {
  const sets = await fetchAllScryfallSets();
  let matched = 0;

  for (const row of rows) {
    const hit = findBestScryfallSet(row.set_name, sets);
    if (!hit?.released_at) continue;

    const iso = hit.released_at.slice(0, 10);
    const y = parseInt(iso.slice(0, 4), 10);
    if (Number.isNaN(y) || iso.length < 10) continue;

    row.release_date = iso;
    row.release_year = y;
    matched++;
  }

  return { matched };
}
