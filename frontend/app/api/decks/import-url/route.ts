import { NextRequest, NextResponse } from "next/server";
import { createClient, createClientWithBearerToken } from "@/lib/server-supabase";
import { getGuestToken } from "@/lib/api/get-guest-token";
import { rejectUnlessCsrfOrBearer } from "@/lib/api/requireCsrf";
import { parseExternalDeckUrl } from "@/lib/external-deck-meta/url";
import { addRateLimitHeaders, checkRateLimit } from "@/lib/api/rate-limit";
import { hashGuestToken, hashString } from "@/lib/guest-tracking";

type ImportedDeck = {
  title: string;
  format: string;
  deckText: string;
};

type QtyLine = {
  name: string;
  qty: number;
  zone?: "mainboard" | "sideboard" | "commander";
};

const FETCH_TIMEOUT_MS = 12000;
const MAX_RESPONSE_CHARS = 2_000_000;
const IMPORT_BURST_WINDOW_MS = 60 * 1000;
const IMPORT_IDENTITY_BURST_LIMIT = 20;
const IMPORT_IP_BURST_LIMIT = 80;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function bearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("Authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() || null : null;
}

function cleanName(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanQty(value: unknown): number {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? Math.min(Math.floor(qty), 999) : 1;
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ManaTapAI deck importer",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Import source returned HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_RESPONSE_CHARS) throw new Error("Deck export is too large to import.");
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function moxfieldCardName(entry: any, fallback: string): string {
  return cleanName(
    entry?.card?.name ||
      entry?.card?.faceName ||
      entry?.name ||
      fallback
  );
}

function moxfieldBoardLines(board: unknown, zone: QtyLine["zone"]): QtyLine[] {
  if (!board || typeof board !== "object") return [];
  return Object.entries(board as Record<string, any>)
    .map(([fallback, entry]) => ({
      name: moxfieldCardName(entry, fallback),
      qty: cleanQty(entry?.quantity ?? entry?.qty ?? entry?.card?.quantity),
      zone,
    }))
    .filter((line) => line.name);
}

function parseMoxfield(json: any): ImportedDeck {
  const commanderLines = [
    ...moxfieldBoardLines(json?.commanders, "commander"),
    ...moxfieldBoardLines(json?.companions, "mainboard"),
  ];
  const mainLines = [
    ...moxfieldBoardLines(json?.mainboard, "mainboard"),
    ...moxfieldBoardLines(json?.main, "mainboard"),
  ];
  const sideLines = [
    ...moxfieldBoardLines(json?.sideboard, "sideboard"),
    ...moxfieldBoardLines(json?.side, "sideboard"),
  ];

  const allLines = [...commanderLines, ...mainLines, ...sideLines];
  if (!allLines.length) throw new Error("No cards found in that Moxfield deck.");

  const formatRaw = cleanName(json?.format || json?.formatName).toLowerCase();
  const format = formatRaw.includes("commander") || formatRaw.includes("edh") ? "Commander" : cleanName(json?.format || "Other");
  return {
    title: cleanName(json?.name) || "Imported Deck",
    format: format || "Other",
    deckText: renderDeckText(allLines),
  };
}

function archidektCardName(entry: any): string {
  return cleanName(
    entry?.card?.oracleCard?.name ||
      entry?.card?.name ||
      entry?.card?.cardName ||
      entry?.cardName ||
      entry?.name
  );
}

function archidektCategories(entry: any): string[] {
  const raw = Array.isArray(entry?.categories) ? entry.categories : [];
  return raw.map((item: any) => cleanName(typeof item === "string" ? item : item?.name)).filter(Boolean);
}

function parseArchidekt(json: any): ImportedDeck {
  const sourceCards = Array.isArray(json?.cards) ? json.cards : [];
  const lines: QtyLine[] = [];

  for (const entry of sourceCards) {
    const name = archidektCardName(entry);
    if (!name) continue;
    const categories = archidektCategories(entry);
    const categoryText = categories.join(" ").toLowerCase();
    if (/\b(maybeboard|considering)\b/i.test(categoryText)) continue;
    const zone = /\bcommander\b/i.test(categoryText)
      ? "commander"
      : /\bsideboard\b/i.test(categoryText)
        ? "sideboard"
        : "mainboard";
    lines.push({
      name,
      qty: cleanQty(entry?.quantity ?? entry?.qty),
      zone,
    });
  }

  if (!lines.length) throw new Error("No cards found in that Archidekt deck.");

  const formatRaw = cleanName(json?.deckFormat || json?.format).toLowerCase();
  const format = formatRaw.includes("commander") || formatRaw.includes("edh") ? "Commander" : cleanName(json?.deckFormat || json?.format || "Other");
  return {
    title: cleanName(json?.name) || "Imported Deck",
    format: format || "Other",
    deckText: renderDeckText(lines),
  };
}

function renderDeckText(lines: QtyLine[]): string {
  const commander = lines.filter((line) => line.zone === "commander");
  const main = lines.filter((line) => line.zone !== "commander" && line.zone !== "sideboard");
  const side = lines.filter((line) => line.zone === "sideboard");
  const out: string[] = [];

  for (const line of commander) out.push(`CMDR: ${line.qty} ${line.name}`);
  for (const line of main) out.push(`${line.qty} ${line.name}`);
  if (side.length) {
    out.push("", "Sideboard");
    for (const line of side) out.push(`${line.qty} ${line.name}`);
  }
  return out.join("\n").trim();
}

export async function POST(req: NextRequest) {
  try {
    const guest = await getGuestToken(req);
    const csrfBlock = guest.source === "header" ? null : rejectUnlessCsrfOrBearer(req);
    if (csrfBlock) return csrfBlock;

    const supabase = await createClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const token = bearerToken(req);
      if (token) {
        const bearerSupabase = createClientWithBearerToken(token);
        const {
          data: { user: bearerUser },
        } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
        }
      }
    }

    const realUserId = user && user.is_anonymous !== true ? user.id : null;
    let identityKey: string | null = null;
    if (realUserId) {
      identityKey = `user:${realUserId}`;
    } else if (guest.guestToken) {
      identityKey = `guest:${await hashGuestToken(guest.guestToken)}`;
    } else if (user?.is_anonymous === true && user.id) {
      identityKey = `guest:${await hashString(`anonymous-user:${user.id}`)}`;
    }

    if (!identityKey) {
      return NextResponse.json({ ok: false, error: "Authentication or guest session required." }, { status: 401 });
    }

    const burst = checkRateLimit(req, {
      windowMs: IMPORT_BURST_WINDOW_MS,
      maxRequests: IMPORT_IDENTITY_BURST_LIMIT,
      keyGenerator: () => `decks-import-url:${identityKey}`,
    });
    if (!burst.allowed) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Rate limit exceeded", retryAfter: burst.retryAfter }, { status: 429 }),
        burst
      );
    }

    const ipHash = await hashString(getClientIp(req));
    const ipBurst = checkRateLimit(req, {
      windowMs: IMPORT_BURST_WINDOW_MS,
      maxRequests: IMPORT_IP_BURST_LIMIT,
      keyGenerator: () => `decks-import-url:ip:${ipHash}`,
    });
    if (!ipBurst.allowed) {
      return addRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Rate limit exceeded", retryAfter: ipBurst.retryAfter }, { status: 429 }),
        ipBurst
      );
    }

    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const rawUrl = String(body.url || "").trim();
    let inputUrl: URL;
    try {
      inputUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ ok: false, error: "Paste a public Moxfield or Archidekt deck URL." }, { status: 400 });
    }
    if (inputUrl.protocol !== "https:") {
      return NextResponse.json({ ok: false, error: "Deck import links must use HTTPS." }, { status: 400 });
    }
    const parsed = parseExternalDeckUrl(rawUrl);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "Paste a public Moxfield or Archidekt deck URL." }, { status: 400 });
    }

    if (parsed.sourceKey === "moxfield") {
      const json = await fetchJson(`https://api2.moxfield.com/v2/decks/all/${encodeURIComponent(parsed.externalId)}`);
      return NextResponse.json({ ok: true, source: "moxfield", ...parseMoxfield(json) });
    }

    if (parsed.sourceKey === "archidekt") {
      const json = await fetchJson(`https://archidekt.com/api/decks/${encodeURIComponent(parsed.externalId)}/`);
      return NextResponse.json({ ok: true, source: "archidekt", ...parseArchidekt(json) });
    }

    return NextResponse.json({ ok: false, error: "Unsupported import source." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Could not import that deck URL." }, { status: 400 });
  }
}
