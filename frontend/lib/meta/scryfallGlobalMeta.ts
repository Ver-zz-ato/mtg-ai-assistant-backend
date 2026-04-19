/**
 * External Commander / Commander-format card signals from Scryfall's public API.
 * https://scryfall.com/docs/api — rate limit ~50–100ms between calls; we paginate via next_page.
 */

export type MetaEntityType = "commander" | "card";

export type NormalizedGlobalMetaRow = {
  entityType: MetaEntityType;
  name: string;
  nameNorm: string;
  rank: number;
  score: number;
  trendScore: number;
  deckCount?: number;
  source: string;
  timeWindow: string;
  imageUri?: string;
  meta?: Record<string, unknown>;
};

const SCRYFALL_SOURCE = "scryfall";
const TW_EDHREC_POPULAR = "edhrec_popular";
const TW_EDHREC_BUDGET = "edhrec_budget_usd2";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function normName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

type ScryfallList = {
  object: string;
  has_more?: boolean;
  next_page?: string;
  data?: ScryfallCardLite[];
  details?: string;
};

type ScryfallCardLite = {
  name: string;
  type_line?: string;
  edhrec_rank?: number | null;
  image_uris?: { art_crop?: string; small?: string };
  card_faces?: { image_uris?: { art_crop?: string; small?: string } }[];
  released_at?: string | null;
};

function artCrop(c: ScryfallCardLite): string | undefined {
  const u = c.image_uris?.art_crop ?? c.image_uris?.small;
  if (u) return u;
  const f = c.card_faces?.[0]?.image_uris?.art_crop ?? c.card_faces?.[0]?.image_uris?.small;
  return f;
}

function edhrecScore(rank: number | null | undefined): number {
  if (rank == null || rank <= 0) return 0;
  return 1 / Math.log10(rank + 10);
}

async function fetchScryfallListPages(startUrl: string, maxPages: number): Promise<ScryfallCardLite[]> {
  const out: ScryfallCardLite[] = [];
  let url: string | undefined = startUrl;
  for (let p = 0; p < maxPages && url; p++) {
    // eslint-disable-next-line no-restricted-globals -- Scryfall cards/search public API (absolute api.scryfall.com URLs)
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`scryfall_http_${res.status}`);
    const json = (await res.json()) as ScryfallList;
    if (json.object === "error") throw new Error((json as { details?: string }).details || "scryfall_error");
    const chunk = json.data ?? [];
    out.push(...chunk);
    url = json.has_more && json.next_page ? json.next_page : undefined;
    if (url) await sleep(75);
  }
  return out;
}

const ENC = encodeURIComponent;

/** Commanders legal in Commander, EDHREC popularity order (global constructed signal). */
export async function fetchGlobalCommanderPopular(maxPages = 2): Promise<NormalizedGlobalMetaRow[]> {
  const q =
    "is:commander legal:commander game:paper -type:plane -type:phenomenon -border:silver -stamp:galaxy";
  const url = `https://api.scryfall.com/cards/search?q=${ENC(q)}&unique=cards&order=edhrec&dir=asc`;
  const cards = await fetchScryfallListPages(url, maxPages);
  return normalizeCommanderRows(cards, TW_EDHREC_POPULAR, 1);
}

/**
 * “Rising” global proxy: commanders from recent premier sets with competitive EDHREC rank.
 * (Momentum vs prior day is blended in the cron using meta_commander_daily history.)
 */
export async function fetchRecentSetPopularCommanders(maxPages = 1): Promise<NormalizedGlobalMetaRow[]> {
  const q =
    "is:commander legal:commander game:paper year>=2023 -type:plane -border:silver -stamp:galaxy";
  const url = `https://api.scryfall.com/cards/search?q=${ENC(q)}&unique=cards&order=edhrec&dir=asc`;
  const cards = await fetchScryfallListPages(url, maxPages);
  return normalizeCommanderRows(cards, "edhrec_recent_sets", 1, { recentSetsBoost: true });
}

function normalizeCommanderRows(
  cards: ScryfallCardLite[],
  timeWindow: string,
  startRank: number,
  opts?: { recentSetsBoost?: boolean }
): NormalizedGlobalMetaRow[] {
  const seen = new Set<string>();
  const rows: NormalizedGlobalMetaRow[] = [];
  let r = startRank;
  for (const c of cards) {
    const name = c.name?.trim();
    if (!name) continue;
    const nn = normName(name);
    if (seen.has(nn)) continue;
    seen.add(nn);
    const er = c.edhrec_rank;
    let score = edhrecScore(er);
    if (opts?.recentSetsBoost && score > 0) score *= 1.15;
    rows.push({
      entityType: "commander",
      name,
      nameNorm: nn,
      rank: r++,
      score,
      trendScore: 0,
      source: SCRYFALL_SOURCE,
      timeWindow,
      imageUri: artCrop(c),
      meta: { edhrec_rank: er ?? null, type_line: c.type_line },
    });
  }
  return rows;
}

/** Broad EDH card popularity (excludes lands; paper unique cards). */
export async function fetchGlobalPopularCards(maxPages = 2): Promise<NormalizedGlobalMetaRow[]> {
  const q = "game:paper -is:land -is:token -type:plane unique:cards";
  const url = `https://api.scryfall.com/cards/search?q=${ENC(q)}&unique=cards&order=edhrec&dir=asc`;
  const cards = await fetchScryfallListPages(url, maxPages);
  return normalizeCardRows(cards, TW_EDHREC_POPULAR, 1);
}

/** Lower-cost staples with global cEDH/casual adoption (USD retail ≤2 on any print we see). */
export async function fetchGlobalBudgetCards(maxPages = 2): Promise<NormalizedGlobalMetaRow[]> {
  const q =
    "game:paper -is:land -type:basic -is:token unique:cards usd<=2 -border:silver -stamp:galaxy -frame:art_series";
  const url = `https://api.scryfall.com/cards/search?q=${ENC(q)}&unique=cards&order=edhrec&dir=asc`;
  const cards = await fetchScryfallListPages(url, maxPages);
  return normalizeCardRows(cards, TW_EDHREC_BUDGET, 1);
}

function normalizeCardRows(cards: ScryfallCardLite[], timeWindow: string, startRank: number): NormalizedGlobalMetaRow[] {
  const seen = new Set<string>();
  const rows: NormalizedGlobalMetaRow[] = [];
  let r = startRank;
  for (const c of cards) {
    const name = c.name?.trim();
    if (!name) continue;
    const nn = normName(name);
    if (seen.has(nn)) continue;
    const tl = (c.type_line ?? "").toLowerCase();
    if (/\bland\b/.test(tl)) continue;
    seen.add(nn);
    const er = c.edhrec_rank;
    rows.push({
      entityType: "card",
      name,
      nameNorm: nn,
      rank: r++,
      score: edhrecScore(er),
      trendScore: 0,
      source: SCRYFALL_SOURCE,
      timeWindow,
      imageUri: artCrop(c),
      meta: { edhrec_rank: er ?? null, type_line: c.type_line },
    });
  }
  return rows;
}

export const SCRYFALL_META = {
  source: SCRYFALL_SOURCE,
  twPopular: TW_EDHREC_POPULAR,
  twBudget: TW_EDHREC_BUDGET,
} as const;
