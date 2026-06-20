import type { ExternalDeckCard, ExternalDeckSourceKey, NormalizedExternalDeck } from "./types";
import { sourceDeckUrl } from "./url";

type FetchJsonResult =
  | { ok: true; json: unknown }
  | { ok: false; status: number; error: string; retryAfter?: string | null };

async function fetchJson(url: string, sourceKey: ExternalDeckSourceKey): Promise<FetchJsonResult> {
  try {
    // eslint-disable-next-line no-restricted-globals -- External source adapters call absolute public deck APIs with explicit headers/cache.
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": `ManaTapExternalDeckMeta/1.0 (${sourceKey}; admin QA ingest)`,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        retryAfter: res.headers.get("retry-after"),
        error: `${sourceKey}_http_${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
      };
    }
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function numberQty(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function pushCard(out: ExternalDeckCard[], rawName: unknown, rawQty: unknown, board: ExternalDeckCard["board"], category?: string | null) {
  const name = text(rawName);
  if (!name) return;
  out.push({ name, quantity: numberQty(rawQty), board, category });
}

function moxfieldCardsFromBoard(board: unknown, boardName: ExternalDeckCard["board"], out: ExternalDeckCard[]) {
  const obj = asRecord(board);
  for (const value of Object.values(obj)) {
    const row = asRecord(value);
    const card = asRecord(row.card);
    pushCard(out, card.name ?? row.name, row.quantity ?? row.qty ?? row.count, boardName, text(row.boardType) ?? text(row.category));
  }
}

function normalizeMoxfield(json: unknown, externalId: string): NormalizedExternalDeck {
  const root = asRecord(json);
  const boards = asRecord(root.boards);
  const commanders: string[] = [];
  const cards: ExternalDeckCard[] = [];
  moxfieldCardsFromBoard(root.commanders ?? boards.commanders, "commander", cards);
  moxfieldCardsFromBoard(root.mainboard ?? boards.mainboard, "mainboard", cards);
  moxfieldCardsFromBoard(root.sideboard ?? boards.sideboard, "sideboard", cards);
  moxfieldCardsFromBoard(root.maybeboard ?? boards.maybeboard, "maybeboard", cards);
  for (const c of cards.filter((card) => card.board === "commander")) commanders.push(c.name);
  const main = cards.filter((card) => card.board !== "commander");
  return {
    sourceKey: "moxfield",
    externalId,
    url: sourceDeckUrl("moxfield", externalId),
    title: text(root.name),
    ownerName: text(asRecord(root.createdByUser).userName) ?? text(asRecord(root.author).userName),
    format: text(root.format) ?? text(root.formatName),
    commanders: [...new Set(commanders)],
    cards: main.length ? cards : cards.filter((card) => card.board === "commander"),
    publishedAt: text(root.createdAt),
    externalUpdatedAt: text(root.lastUpdatedAt) ?? text(root.updatedAt),
    sourcePayload: { fetchedShape: "moxfield_v2_decks_all" },
  };
}

function archidektCardName(row: Record<string, unknown>): string | null {
  const card = asRecord(row.card);
  const oracle = asRecord(card.oracleCard);
  return text(oracle.name) ?? text(card.name) ?? text(row.name);
}

function archidektFormatName(raw: unknown): string | null {
  const objName = text(asRecord(raw).name);
  if (objName) return objName;
  const stringValue = text(raw);
  if (stringValue) return stringValue;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  const known: Record<number, string> = {
    1: "standard",
    2: "modern",
    3: "commander",
    4: "legacy",
    5: "vintage",
    6: "pauper",
    7: "frontier",
    8: "penny",
    9: "future standard",
    10: "historic",
    11: "pioneer",
    12: "brawl",
    13: "oathbreaker",
    14: "alchemy",
    15: "explorer",
  };
  return known[numeric] ?? null;
}

function normalizeArchidekt(json: unknown, externalId: string): NormalizedExternalDeck {
  const root = asRecord(json);
  const cards: ExternalDeckCard[] = [];
  const commanders: string[] = [];
  const cardPackages = asArray(root.cards);
  for (const item of cardPackages) {
    const row = asRecord(item);
    const categories = asArray(row.categories).map((c) => text(asRecord(c).name) ?? text(c)).filter(Boolean) as string[];
    const isCommander = Boolean(row.commander) || categories.some((c) => /commander/i.test(c));
    const isSideboard = Boolean(row.sideboard) || categories.some((c) => /sideboard/i.test(c));
    const board = isCommander ? "commander" : isSideboard ? "sideboard" : "mainboard";
    const name = archidektCardName(row);
    pushCard(cards, name, row.quantity ?? row.qty ?? row.count, board, categories[0] ?? null);
    if (isCommander && name) commanders.push(name);
  }
  const commanderObj = asRecord(root.commander);
  const commanderName = archidektCardName(commanderObj) ?? text(commanderObj.name);
  if (commanderName) commanders.push(commanderName);
  return {
    sourceKey: "archidekt",
    externalId,
    url: sourceDeckUrl("archidekt", externalId),
    title: text(root.name),
    ownerName: text(asRecord(root.owner).username) ?? text(asRecord(root.user).username),
    format: archidektFormatName(root.deckFormat) ?? text(root.format),
    commanders: [...new Set(commanders)],
    cards,
    publishedAt: text(root.createdAt),
    externalUpdatedAt: text(root.updatedAt),
    sourcePayload: { fetchedShape: "archidekt_api_decks" },
  };
}

export async function fetchExternalDeck(sourceKey: ExternalDeckSourceKey, externalId: string): Promise<
  | { ok: true; deck: NormalizedExternalDeck }
  | { ok: false; status: number; error: string; retryAfter?: string | null }
> {
  if (sourceKey === "archidekt") {
    const res = await fetchJson(`https://archidekt.com/api/decks/${encodeURIComponent(externalId)}/`, sourceKey);
    if (!res.ok) return res;
    return { ok: true, deck: normalizeArchidekt(res.json, externalId) };
  }
  if (sourceKey === "moxfield") {
    const res = await fetchJson(`https://api2.moxfield.com/v2/decks/all/${encodeURIComponent(externalId)}`, sourceKey);
    if (!res.ok) return res;
    return { ok: true, deck: normalizeMoxfield(res.json, externalId) };
  }
  return { ok: false, status: 400, error: "unsupported_source" };
}

export async function discoverArchidektRecentDecks(): Promise<string[]> {
  const res = await fetchJson("https://archidekt.com/api/decks/v3/?orderBy=-createdAt&pageSize=20", "archidekt");
  if (!res.ok) return [];
  const root = asRecord(res.json);
  const rows = asArray(root.results ?? root.data ?? res.json);
  const ids: string[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    const id = text(row.id) ?? (typeof row.id === "number" ? String(row.id) : null);
    if (id && /^\d+$/.test(id)) ids.push(id);
  }
  return [...new Set(ids)].slice(0, 20);
}

export async function discoverArchidektCommanderSearchDecks(
  query: string,
  opts?: { page?: number; maxIds?: number }
): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; error: string; retryAfter?: string | null }> {
  const q = String(query || "").trim();
  if (!q) return { ok: true, ids: [] };
  const page = Math.max(1, Math.floor(Number(opts?.page) || 1));
  const maxIds = Math.max(1, Math.min(60, Math.floor(Number(opts?.maxIds) || 60)));
  const url = `https://archidekt.com/api/decks/v3/?orderBy=-createdAt&deckFormat=3&name=${encodeURIComponent(q)}&page=${page}`;
  const res = await fetchJson(url, "archidekt");
  if (!res.ok) return res;
  const root = asRecord(res.json);
  const rows = asArray(root.results ?? root.data ?? res.json);
  const ids: string[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    const id = text(row.id) ?? (typeof row.id === "number" ? String(row.id) : null);
    if (id && /^\d+$/.test(id)) ids.push(id);
  }
  return { ok: true, ids: [...new Set(ids)].slice(0, maxIds) };
}
