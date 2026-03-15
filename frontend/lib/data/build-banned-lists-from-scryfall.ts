/**
 * Build banned card lists from Scryfall bulk oracle_cards (streaming).
 * Used by cron and optional script. Returns same shape as banned_cards.json.
 */
import { Readable } from "stream";
import { finished } from "stream/promises";
import { createGunzip } from "zlib";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StreamArray = require("stream-json/streamers/StreamArray") as { withParser: (opts?: unknown) => NodeJS.ReadWriteStream };

export type BannedCardsData = {
  Commander: string[];
  Modern: string[];
  Pioneer: string[];
  Standard: string[];
  Pauper: string[];
  Brawl: string[];
};

const FORMAT_KEYS: (keyof BannedCardsData)[] = [
  "Commander",
  "Modern",
  "Pioneer",
  "Standard",
  "Pauper",
  "Brawl",
];

const SCRYFALL_TO_OUR_KEY: Record<string, keyof BannedCardsData> = {
  commander: "Commander",
  modern: "Modern",
  pioneer: "Pioneer",
  standard: "Standard",
  pauper: "Pauper",
  brawl: "Brawl",
};

function emptyBanned(): BannedCardsData {
  return {
    Commander: [],
    Modern: [],
    Pioneer: [],
    Standard: [],
    Pauper: [],
    Brawl: [],
  };
}

type CardLike = { name?: string; legalities?: Record<string, string> };

/**
 * Fetch Scryfall bulk manifest and return download_uri for oracle_cards.
 */
export async function getOracleCardsBulkUri(): Promise<string> {
  const res = await fetch("https://api.scryfall.com/bulk-data");
  if (!res.ok) throw new Error(`Scryfall bulk-data: ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ type: string; download_uri?: string }> };
  const oracle = data.data?.find((d) => d.type === "oracle_cards");
  if (!oracle?.download_uri) throw new Error("Scryfall: oracle_cards bulk not found");
  return oracle.download_uri;
}

/**
 * Stream oracle_cards bulk (gzip JSON array), collect banned card names per format.
 * Keeps memory low by processing one card at a time.
 */
export async function buildBannedListsFromStream(
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream
): Promise<BannedCardsData> {
  const banned = emptyBanned();
  const byFormat = FORMAT_KEYS.reduce<Record<string, Set<string>>>((acc, k) => {
    acc[k] = new Set<string>();
    return acc;
  }, {});

  const nodeStream =
    "getReader" in body
      ? Readable.fromWeb(body as any)
      : (body as NodeJS.ReadableStream);

  const gunzip = createGunzip();
  nodeStream.pipe(gunzip);
  const pipeline = gunzip.pipe(StreamArray.withParser());

  pipeline.on("data", ({ value }: { value: CardLike }) => {
    const name = value?.name;
    const legalities = value?.legalities;
    if (!name || typeof name !== "string" || !legalities || typeof legalities !== "object") return;
    for (const [format, status] of Object.entries(legalities)) {
      if (status !== "banned") continue;
      const ourKey = SCRYFALL_TO_OUR_KEY[format];
      if (ourKey) byFormat[ourKey].add(name);
    }
  });

  await finished(pipeline);

  for (const k of FORMAT_KEYS) {
    banned[k] = Array.from(byFormat[k]).sort();
  }
  return banned;
}

/**
 * Full flow: get oracle_cards URI, fetch stream, build banned lists.
 */
export async function fetchAndBuildBannedLists(): Promise<BannedCardsData> {
  const uri = await getOracleCardsBulkUri();
  const res = await fetch(uri);
  if (!res.body) throw new Error("Scryfall bulk response has no body");
  return buildBannedListsFromStream(res.body);
}
