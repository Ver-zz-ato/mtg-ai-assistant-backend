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

async function searchMoxfieldByFormat(format: string, page: number, pageSize: number): Promise<Array<{ publicId?: string; id?: string }>> {
  const q = `format:${format}`;
  const url = `https://api.moxfield.com/v2/decks/search?q=${encodeURIComponent(q)}&sort=popularity&page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "ManaTap-AI/1.0", Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: Array<{ publicId?: string; id?: string }> };
  return data.data ?? [];
}

async function fetchMoxfield60CardDeck(
  deckId: string,
  targetFormat: string
): Promise<{ title: string; cards: Array<{ name: string; qty: number }>; format: string } | null> {
  const res = await fetch(`https://api.moxfield.com/v2/decks/all/${deckId}`, {
    headers: { "User-Agent": "ManaTap-AI/1.0", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const mainboard = data.mainboard as Record<string, { quantity?: number }> | undefined;
  const sideboard = data.sideboard as Record<string, { quantity?: number }> | undefined;
  const commanders = data.commanders as Record<string, unknown> | undefined;
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
  if (mainTotal < MIN_MAIN || total > MAX_TOTAL) return null;
  const deckFormat = (data.format as string) || targetFormat;
  return {
    title: (data.name as string) || `${deckFormat} - Imported`,
    cards,
    format: deckFormat,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const formatParam = typeof body.format === "string" ? body.format.trim() : "";
    const format = FORMATS.includes(formatParam as (typeof FORMATS)[number]) ? formatParam : "Modern";
    const count = Math.min(Math.max(1, Number(body.count) || DEFAULT_COUNT), MAX_COUNT);

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client unavailable" }, { status: 500 });
    }

    const results: Array<{ title: string; success: boolean; error?: string; deckId?: string }> = [];
    const seenTitles = new Set<string>();

    let page = 1;
    let fetched = 0;
    const pageSize = 20;

    while (fetched < count) {
      const searchResults = await searchMoxfieldByFormat(format, page, pageSize);
      if (searchResults.length === 0) break;
      for (const hit of searchResults) {
        if (fetched >= count) break;
        const deckId = hit.publicId ?? hit.id;
        if (!deckId) continue;
        try {
          const deck = await fetchMoxfield60CardDeck(deckId, format);
          if (!deck) {
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
    return NextResponse.json({
      ok: true,
      results,
      summary: { total: results.length, successful, failed: results.length - successful },
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
