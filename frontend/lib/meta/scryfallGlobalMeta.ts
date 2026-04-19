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
  /** Lowercase three- to five-letter set code for the returned printing */
  set?: string;
  prices?: { usd?: string | null; eur?: string | null };
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

function parseUsdEurFromCard(c: ScryfallCardLite): { usd?: number; eur?: number } {
  const rawU = c.prices?.usd != null ? parseFloat(String(c.prices.usd)) : NaN;
  const rawE = c.prices?.eur != null ? parseFloat(String(c.prices.eur)) : NaN;
  const o: { usd?: number; eur?: number } = {};
  if (Number.isFinite(rawU) && rawU > 0) o.usd = rawU;
  if (Number.isFinite(rawE) && rawE > 0) o.eur = rawE;
  return o;
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
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        // Scryfall requires User-Agent; omitting can yield 400 in some runtimes.
        "User-Agent": "ManaTapMetaSignals/1.0 (https://manatap.app)",
      },
    });
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

/** Expand when the tighter window returns too few candidates to rank meaningfully. */
const RECENT_SET_ELIGIBILITY_DAYS = [180, 270, 365] as const;
/** Stop at the first window where we have at least this many Scryfall rows after date filter (or use 365d pool). */
const MIN_RAW_CANDIDATES_TO_PICK_WINDOW = 10;

function isoDateUtcDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** True if the printing's release date is within `days` days of today (UTC date). */
function isReleasedWithinWindow(releasedAt: string | null | undefined, days: number): boolean {
  if (!releasedAt) return false;
  const t = Date.parse(releasedAt);
  if (!Number.isFinite(t)) return false;
  const rel = new Date(t);
  rel.setUTCHours(0, 0, 0, 0);
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return rel >= cutoff;
}

export type RecentSetBreakoutFetchResult = {
  rows: NormalizedGlobalMetaRow[];
  eligibilityDays: number;
  rawCandidateCount: number;
  distinctSetCodes: number;
  cutoffIso: string;
};

/**
 * Commanders from genuinely recent set releases only (Scryfall `date` + `released_at` check).
 * Tries 180d → 270d → 365d when each window has too few candidates.
 */
export async function fetchRecentSetBreakoutCommanders(
  maxPages = 3
): Promise<RecentSetBreakoutFetchResult> {
  const empty = (days: number, cutoff: string): RecentSetBreakoutFetchResult => ({
    rows: [],
    eligibilityDays: days,
    rawCandidateCount: 0,
    distinctSetCodes: 0,
    cutoffIso: cutoff,
  });

  let last: RecentSetBreakoutFetchResult = empty(
    RECENT_SET_ELIGIBILITY_DAYS[RECENT_SET_ELIGIBILITY_DAYS.length - 1],
    isoDateUtcDaysAgo(RECENT_SET_ELIGIBILITY_DAYS[RECENT_SET_ELIGIBILITY_DAYS.length - 1])
  );

  for (const days of RECENT_SET_ELIGIBILITY_DAYS) {
    const cutoffIso = isoDateUtcDaysAgo(days);
    const q = `is:commander legal:commander game:paper date>=${cutoffIso} -type:plane -border:silver -stamp:galaxy`;
    const url = `https://api.scryfall.com/cards/search?q=${ENC(q)}&unique=cards&order=edhrec&dir=asc`;

    let cards: ScryfallCardLite[];
    try {
      cards = await fetchScryfallListPages(url, maxPages);
    } catch {
      continue;
    }

    const filtered: ScryfallCardLite[] = [];
    const seen = new Set<string>();
    for (const c of cards) {
      if (!isReleasedWithinWindow(c.released_at, days)) continue;
      const name = c.name?.trim();
      if (!name) continue;
      const nn = normName(name);
      if (seen.has(nn)) continue;
      seen.add(nn);
      filtered.push(c);
    }

    const setCodes = new Set(filtered.map((c) => c.set).filter(Boolean) as string[]);
    const rows = normalizeCommanderRows(filtered, "edhrec_recent_set_breakouts", 1);
    last = {
      rows,
      eligibilityDays: days,
      rawCandidateCount: filtered.length,
      distinctSetCodes: setCodes.size,
      cutoffIso,
    };

    if (filtered.length >= MIN_RAW_CANDIDATES_TO_PICK_WINDOW || days === RECENT_SET_ELIGIBILITY_DAYS[RECENT_SET_ELIGIBILITY_DAYS.length - 1]) {
      return last;
    }
  }

  return last;
}

/**
 * Back-compat: recent-set breakout pool (date-eligible only) for trending blend inputs.
 * Prefer `fetchRecentSetBreakoutCommanders` when you need eligibility metadata.
 */
export async function fetchRecentSetPopularCommanders(maxPages = 3): Promise<NormalizedGlobalMetaRow[]> {
  const r = await fetchRecentSetBreakoutCommanders(maxPages);
  return r.rows;
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
      meta: {
        edhrec_rank: er ?? null,
        type_line: c.type_line,
        set: c.set ?? null,
        released_at: c.released_at ?? null,
      },
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
    const money = parseUsdEurFromCard(c);
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
      meta: { edhrec_rank: er ?? null, type_line: c.type_line, ...money },
    });
  }
  return rows;
}

export const SCRYFALL_META = {
  source: SCRYFALL_SOURCE,
  twPopular: TW_EDHREC_POPULAR,
  twBudget: TW_EDHREC_BUDGET,
} as const;
