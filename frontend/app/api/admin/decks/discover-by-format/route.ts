/**
 * Admin: discover 60-card format decks (Modern, Pioneer, Standard) on Moxfield and import.
 * Searches by format, fetches top decks, imports as public with commander=null.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";
import { containsProfanity } from "@/lib/profanity";

const PUBLIC_DECKS_USER_ID = "b8c7d6e5-f4a3-4210-9d00-000000000001";
const DEFAULT_COUNT = 50;
const MAX_COUNT = 50;
const MIN_MAIN = 60;
const MAX_TOTAL = 75;

const FORMATS = ["Modern", "Pioneer", "Standard"] as const;

const MOXFIELD_API = "https://api2.moxfield.com";
const MOXFIELD_API_LEGACY = "https://api.moxfield.com";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  Referer: "https://www.moxfield.com/",
  Origin: "https://www.moxfield.com",
} as const;
const DEBUG = process.env.NODE_ENV === "development";
const DELAY_MS = 600;
const RETRY_429_MS = 3000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let res = await fetch(url, { headers: HEADERS });
  if (res.status === 429 && RETRY_429_MS > 0) {
    if (DEBUG) console.log(`[discover-by-format] 429 rate limited, waiting ${RETRY_429_MS}ms before retry`, { label });
    await sleep(RETRY_429_MS);
    res = await fetch(url, { headers: HEADERS });
  }
  return res;
}

function extractDeckHits(json: unknown): Array<{ publicId?: string; id?: string }> {
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.decks)) return obj.decks;
  if (Array.isArray(obj)) return obj;
  return [];
}

async function searchMoxfieldByFormat(format: string, page: number, pageSize: number): Promise<{ hits: Array<{ publicId?: string; id?: string }>; blocked?: boolean }> {
  const legacyUrl = `${MOXFIELD_API_LEGACY}/v2/decks/search?q=${encodeURIComponent(`format:${format}`)}&sort=popularity&page=${page}&pageSize=${pageSize}`;
  if (DEBUG) console.log("[discover-by-format] search legacy", { format, page, legacyUrl });
  let res = await fetchWithRetry(legacyUrl, `search legacy ${format}`);
  if (DEBUG) console.log("[discover-by-format] search legacy response", { status: res.status, ok: res.ok });
  if (res.status === 403) return { hits: [], blocked: true };
  if (res.ok) {
    const data = await res.json();
    const hits = extractDeckHits(data);
    if (DEBUG) console.log("[discover-by-format] search legacy hits", { count: hits.length, rawKeys: Object.keys(data as object) });
    if (hits.length > 0) return { hits };
  } else if (DEBUG) {
    console.log("[discover-by-format] search legacy body", (await res.text()).slice(0, 500));
  }
  const params = new URLSearchParams({
    fmt: format,
    pageNumber: String(page),
    pageSize: String(pageSize),
    sortType: "Views",
    sortDirection: "Descending",
  });
  const api2Url = `${MOXFIELD_API}/v2/decks/search?${params.toString()}`;
  if (DEBUG) console.log("[discover-by-format] search api2 fallback", { api2Url });
  await sleep(DELAY_MS);
  res = await fetchWithRetry(api2Url, `search api2 ${format}`);
  if (res.status === 403) return { hits: [], blocked: true };
  if (!res.ok) return { hits: [] };
  const api2Data = await res.json();
  return { hits: extractDeckHits(api2Data) };
}

async function fetchMoxfield60CardDeck(
  deckId: string,
  targetFormat: string
): Promise<{ title: string; cards: Array<{ name: string; qty: number }>; format: string } | null> {
  const api2Url = `${MOXFIELD_API}/v2/decks/all/${deckId}`;
  if (DEBUG) console.log("[discover-by-format] fetch deck", { deckId, api2Url });
  let res = await fetchWithRetry(api2Url, `fetch ${deckId}`);
  if (DEBUG) console.log("[discover-by-format] fetch api2", { deckId, status: res.status });
  if (!res.ok) {
    await sleep(DELAY_MS);
    res = await fetchWithRetry(`${MOXFIELD_API_LEGACY}/v2/decks/all/${deckId}`, `fetch legacy ${deckId}`);
    if (DEBUG) console.log("[discover-by-format] fetch legacy", { deckId, status: res.status });
    if (!res.ok) {
      if (DEBUG) console.log("[discover-by-format] fetch failed", { deckId, body: (await res.text()).slice(0, 300) });
      return null;
    }
  }
  const data = (await res.json()) as Record<string, unknown>;
  const mainboard = data.mainboard as Record<string, { quantity?: number }> | undefined;
  const sideboard = data.sideboard as Record<string, { quantity?: number }> | undefined;
  const commanders = data.commanders as Record<string, unknown> | undefined;
  if (DEBUG) console.log("[discover-by-format] deck parse", { deckId, hasMainboard: !!mainboard, mainCount: mainboard ? Object.keys(mainboard).length : 0, hasCommanders: !!(commanders && Object.keys(commanders).length) });
  if (!mainboard) return null;
  if (commanders && Object.keys(commanders).length > 0) return null;
  const cards: Array<{ name: string; qty: number }> = [];
  for (const [name, entry] of Object.entries(mainboard)) {
    cards.push({ name, qty: entry?.quantity ?? 1 });
  }
  if (sideboard && typeof sideboard === "object") {
    for (const [name, entry] of Object.entries(sideboard)) {
      cards.push({ name, qty: entry?.quantity ?? 1 });
    }
  }
  const mainTotal = Object.values(mainboard).reduce((s, e) => s + (e?.quantity ?? 1), 0);
  const total = cards.reduce((s, c) => s + c.qty, 0);
  if (mainTotal < MIN_MAIN || total > MAX_TOTAL) {
    if (DEBUG) console.log("[discover-by-format] deck rejected", { deckId, mainTotal, total, MIN_MAIN, MAX_TOTAL });
    return null;
  }
  const deckFormat = (data.format as string) || targetFormat;
  return {
    title: (data.name as string) || `${deckFormat} - Imported`,
    cards,
    format: deckFormat,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (DEBUG) console.log("[discover-by-format] POST start");
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      if (DEBUG) console.log("[discover-by-format] auth failed", { hasUser: !!user });
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const formatParam = typeof body.format === "string" ? body.format.trim() : "";
    const format = FORMATS.includes(formatParam as (typeof FORMATS)[number]) ? formatParam : "Modern";
    const count = Math.min(Math.max(1, Number(body.count) || DEFAULT_COUNT), MAX_COUNT);
    if (DEBUG) console.log("[discover-by-format] params", { format, count, body });

    const admin = getAdmin();
    if (!admin) {
      if (DEBUG) console.log("[discover-by-format] admin client missing");
      return NextResponse.json({ ok: false, error: "Admin client unavailable" }, { status: 500 });
    }

    const results: Array<{ title: string; success: boolean; error?: string; deckId?: string }> = [];
    const seenTitles = new Set<string>();

    let page = 1;
    let fetched = 0;
    const pageSize = 20;

    while (fetched < count) {
      await sleep(DELAY_MS);
      const { hits: searchResults, blocked } = await searchMoxfieldByFormat(format, page, pageSize);
      if (blocked) {
        if (DEBUG) console.log("[discover-by-format] Moxfield blocked (403), stopping");
        return NextResponse.json({
          ok: false,
          error: "Moxfield is blocking server-side requests (Cloudflare). Use CSV upload or paste deck URLs in Fetch from URLs instead.",
          results: results.length > 0 ? results : undefined,
          summary: results.length > 0 ? { total: results.length, successful: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length } : undefined,
        });
      }
      if (DEBUG) console.log("[discover-by-format] page", { page, searchCount: searchResults.length, fetched });
      if (searchResults.length === 0) {
        if (DEBUG) console.log("[discover-by-format] no more results, breaking");
        break;
      }
      for (const hit of searchResults) {
        if (fetched >= count) break;
        const deckId = hit.publicId ?? hit.id;
        if (!deckId) continue;
        try {
          await sleep(DELAY_MS);
          const deck = await fetchMoxfield60CardDeck(deckId, format);
          if (!deck) {
            if (DEBUG) console.log("[discover-by-format] invalid deck", { deckId });
            results.push({ title: "", success: false, error: "Invalid deck (need 60 main, ≤75 total, no commander)" });
            continue;
          }
          const key = `${deck.title}`.toLowerCase();
          if (seenTitles.has(key)) {
            results.push({ title: deck.title, success: false, error: "Duplicate title" });
            continue;
          }
          if (containsProfanity(deck.title)) {
            results.push({ title: deck.title, success: false, error: "Profanity in title" });
            continue;
          }
          const { data: existing } = await admin
            .from("decks")
            .select("id")
            .eq("title", deck.title)
            .eq("user_id", PUBLIC_DECKS_USER_ID)
            .maybeSingle();
          if (existing) {
            results.push({ title: deck.title, success: false, error: "Already exists", deckId: existing.id });
            continue;
          }
          const deckText = deck.cards.map((c) => `${c.qty} ${c.name}`).join("\n");
          const { data: newDeck, error: deckErr } = await admin
            .from("decks")
            .insert({
              user_id: PUBLIC_DECKS_USER_ID,
              title: deck.title,
              format: deck.format,
              plan: "Optimized",
              colors: [],
              currency: "USD",
              deck_text: deckText,
              commander: null,
              is_public: true,
              public: true,
            })
            .select("id")
            .single();
          if (deckErr || !newDeck) {
            if (DEBUG) console.log("[discover-by-format] insert failed", { title: deck.title, error: deckErr?.message });
            results.push({ title: deck.title, success: false, error: deckErr?.message ?? "Insert failed" });
            continue;
          }
          const did = newDeck.id as string;
          for (const c of deck.cards) {
            try {
              await admin.from("deck_cards").insert({ deck_id: did, name: c.name, qty: c.qty });
            } catch {
              /* ignore */
            }
          }
          seenTitles.add(key);
          results.push({ title: deck.title, success: true, deckId: did });
          fetched++;
        } catch (e) {
          results.push({ title: "", success: false, error: String(e) });
        }
      }
      page++;
      if (searchResults.length < pageSize) break;
    }

    const successful = results.filter((r) => r.success).length;
    if (successful > 0) {
      const { pingGoogleSitemap } = await import("@/lib/seo/pingGoogle");
      pingGoogleSitemap().catch(() => {});
    }
    return NextResponse.json({
      ok: true,
      results,
      summary: { total: results.length, successful, failed: results.length - successful },
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    if (DEBUG) console.error("[discover-by-format] error", e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
